-- FASE 3d-3: desconto percentual por item; forma e prazo de pagamento no pedido

-- desconto (R$) → desconto_percentual; dados existentes convertidos pelo valor bruto do item
alter table pedido_itens add column desconto_percentual numeric(5,2) not null default 0
  check (desconto_percentual between 0 and 100);
update pedido_itens
   set desconto_percentual = least(100, round(desconto / (quantidade * preco_unitario) * 100, 2))
 where desconto > 0 and quantidade * preco_unitario > 0;
alter table pedido_itens drop column desconto;

-- forma de pagamento padronizada (texto livre antigo vai para as observações, sem perda)
update pedidos
   set observacoes = concat_ws(' · ', observacoes, 'Pagamento: ' || forma_pagamento),
       forma_pagamento = 'outros'
 where forma_pagamento is not null
   and forma_pagamento not in ('dinheiro','credito','debito','bonificacao','pix','outros');
alter table pedidos
  add constraint pedidos_forma_pagamento_check
    check (forma_pagamento is null or forma_pagamento in ('dinheiro','credito','debito','bonificacao','pix','outros')),
  add column prazo_tipo text not null default 'a_vista' check (prazo_tipo in ('a_vista','a_prazo')),
  add column prazo_dias int check (prazo_dias is null or prazo_dias between 1 and 365),
  add constraint pedidos_prazo_check check ((prazo_tipo = 'a_prazo') = (prazo_dias is not null));

-- criar_pedido: itens com desconto_percentual (≤ desconto máximo da tabela); subtotal = q × p × (1 − d/100)
drop function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid);
create function public.criar_pedido(
  p_representada_id uuid, p_cliente_id uuid, p_itens jsonb,
  p_forma_pagamento text default null, p_confirmar boolean default false, p_id uuid default null,
  p_prazo_tipo text default 'a_vista', p_prazo_dias int default null
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_item jsonb;
  v_prod produtos%rowtype;
  v_preco numeric(12,2);
  v_desc_max numeric(5,2);
  v_qtd numeric(12,3);
  v_desc numeric(5,2);
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_id is not null and exists (select 1 from pedidos where id = p_id) then return p_id; end if; -- reenvio do sync
  if not exists (select 1 from representadas where id = p_representada_id) then raise exception 'Representada não encontrada'; end if;
  if not exists (select 1 from clientes where id = p_cliente_id) then raise exception 'Cliente não encontrado'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item';
  end if;
  if coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' and coalesce(p_prazo_dias, 0) < 1 then
    raise exception 'Informe o prazo em dias';
  end if;

  insert into pedidos (id, user_id, representada_id, cliente_id, numero, status, forma_pagamento, prazo_tipo, prazo_dias, origem)
  values (
    coalesce(p_id, gen_random_uuid()), v_uid, p_representada_id, p_cliente_id,
    'P' || lpad(((select count(*) from pedidos where user_id = v_uid) + 1)::text, 6, '0'),
    'rascunho', nullif(trim(p_forma_pagamento), ''), coalesce(p_prazo_tipo, 'a_vista'),
    case when coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' then p_prazo_dias end, 'app'
  ) returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_prod from produtos
     where id = (v_item->>'produto_id')::uuid and representada_id = p_representada_id;
    if not found then raise exception 'Produto não pertence à representada'; end if;
    if not v_prod.ativo then raise exception 'Produto inativo: %', v_prod.nome; end if;

    v_qtd := (v_item->>'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida para %', v_prod.nome; end if;

    v_preco := null; v_desc_max := null;
    select tp.preco, tp.desconto_max into v_preco, v_desc_max from tabelas_preco tp
     where tp.produto_id = v_prod.id and (tp.cliente_id = p_cliente_id or tp.cliente_id is null)
     order by tp.cliente_id nulls last limit 1;
    v_preco := coalesce(v_preco, v_prod.preco);

    v_desc := coalesce((v_item->>'desconto_percentual')::numeric, 0);
    if v_desc < 0 or v_desc > coalesce(v_desc_max, 0) then
      raise exception 'Desconto acima do máximo permitido (% %%) para %', coalesce(v_desc_max, 0), v_prod.nome;
    end if;

    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, subtotal, comissao_percentual)
    values (v_id, v_prod.id, v_prod.nome, v_qtd, v_preco, v_desc, round(v_qtd * v_preco * (1 - v_desc / 100), 2), v_prod.comissao);
  end loop;

  update pedidos set valor_total = (select sum(subtotal) from pedido_itens where pedido_id = v_id) where id = v_id;

  if p_confirmar then perform confirmar_pedido(v_id); end if;
  return v_id;
end $$;
revoke execute on function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid, text, int) from public, anon;
grant execute on function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid, text, int) to authenticated;
