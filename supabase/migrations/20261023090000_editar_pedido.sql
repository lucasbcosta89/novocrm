-- Edição de pedido (rascunho ou confirmado/entregue): regrava itens com preço, desconto e produtos informados.
-- Pedido confirmado/entregue: recalcula comissão dos itens, comissao_total e a linha em comissoes.
-- % de comissão: mantém o snapshot do item já existente; produto novo usa o % atual do produto.
-- Bloqueado: pedido cancelado ou com comissão já recebida.
create function public.editar_pedido(
  p_pedido_id uuid, p_itens jsonb,
  p_forma_pagamento text default null, p_prazo_tipo text default 'a_vista', p_prazo_dias int default null
) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_ped pedidos%rowtype;
  v_item jsonb;
  v_prod produtos%rowtype;
  v_antigos jsonb;
  v_preco numeric(12,2);
  v_desc_max numeric(5,2);
  v_qtd numeric(12,3);
  v_desc numeric(5,2);
  v_pct numeric(5,2);
  v_sub numeric(12,2);
  v_total numeric(12,2);
  v_com numeric(12,2);
  v_confirmado boolean;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select * into v_ped from pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_ped.status = 'cancelado' then raise exception 'Pedido cancelado não pode ser editado'; end if;
  if exists (select 1 from comissoes where pedido_id = p_pedido_id and status = 'recebida') then
    raise exception 'Comissão já recebida: pedido não pode ser editado';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item';
  end if;
  if coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' and coalesce(p_prazo_dias, 0) < 1 then
    raise exception 'Informe o prazo em dias';
  end if;
  v_confirmado := v_ped.status <> 'rascunho';

  select coalesce(jsonb_object_agg(produto_id::text, comissao_percentual), '{}'::jsonb) into v_antigos
    from pedido_itens where pedido_id = p_pedido_id and produto_id is not null;
  delete from pedido_itens where pedido_id = p_pedido_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_prod from produtos
     where id = (v_item->>'produto_id')::uuid and representada_id = v_ped.representada_id;
    if not found then raise exception 'Produto não pertence à representada'; end if;
    -- produto inativado depois do pedido pode continuar nele, mas não entrar como novo
    if not v_prod.ativo and not (v_antigos ? v_prod.id::text) then raise exception 'Produto inativo: %', v_prod.nome; end if;

    v_qtd := (v_item->>'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida para %', v_prod.nome; end if;
    v_preco := (v_item->>'preco_unitario')::numeric;
    if v_preco is null or v_preco < 0 then raise exception 'Preço inválido para %', v_prod.nome; end if;
    v_desc := coalesce((v_item->>'desconto_percentual')::numeric, 0);
    if v_desc < 0 or v_desc > 100 then raise exception 'Desconto inválido para %', v_prod.nome; end if;

    v_desc_max := null;
    select tp.desconto_max into v_desc_max from tabelas_preco tp
     where tp.produto_id = v_prod.id and (tp.cliente_id = v_ped.cliente_id or tp.cliente_id is null)
     order by tp.cliente_id nulls last limit 1;

    v_pct := coalesce((v_antigos->>v_prod.id::text)::numeric, v_prod.comissao);
    v_sub := round(v_qtd * v_preco * (1 - v_desc / 100), 2);

    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual,
                              desconto_acima_max, subtotal, comissao_percentual, comissao_valor)
    values (p_pedido_id, v_prod.id, v_prod.nome, v_qtd, v_preco, v_desc, v_desc > coalesce(v_desc_max, 0), v_sub, v_pct,
            case when v_confirmado then round(v_sub * v_pct / 100, 2) else 0 end);
  end loop;

  select coalesce(sum(subtotal), 0), coalesce(sum(comissao_valor), 0) into v_total, v_com
    from pedido_itens where pedido_id = p_pedido_id;
  if v_confirmado and v_total <= 0 then raise exception 'Pedido sem itens'; end if;

  update pedidos
     set valor_total = v_total,
         comissao_total = case when v_confirmado then v_com else comissao_total end,
         forma_pagamento = nullif(trim(p_forma_pagamento), ''),
         prazo_tipo = coalesce(p_prazo_tipo, 'a_vista'),
         prazo_dias = case when coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' then p_prazo_dias end
   where id = p_pedido_id;

  if v_confirmado then
    update comissoes
       set valor = v_com, percentual = case when v_total > 0 then round(v_com / v_total * 100, 2) else 0 end
     where pedido_id = p_pedido_id and status <> 'cancelada';
  end if;
end $$;
revoke execute on function public.editar_pedido(uuid, jsonb, text, text, int) from public, anon;
grant execute on function public.editar_pedido(uuid, jsonb, text, text, int) to authenticated;
