-- ACRÉSCIMO por item de pedido: venda acima do preço de tabela (contrapartida do desconto).
-- Subtotal do item = quantidade × preço × (1 + acréscimo%) × (1 − desconto%), arredondado em centavos.
-- Vale no cadastro/edição de pedidos e na importação por planilha (coluna "Acréscimo (%)").
-- Análises: valor_bruto passa a incluir o acréscimo, então valor_desconto continua sendo só o desconto.

alter table pedido_itens add column acrescimo_percentual numeric(5,2) not null default 0
  constraint pedido_itens_acrescimo_percentual_check check (acrescimo_percentual between 0 and 100);

create or replace function public.criar_pedido(
  p_representada_id uuid, p_cliente_id uuid, p_itens jsonb,
  p_forma_pagamento text default null, p_confirmar boolean default false, p_id uuid default null,
  p_prazo_tipo text default 'a_vista', p_prazo_dias int default null, p_codigo text default null
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
  v_acr numeric(5,2);
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

  insert into pedidos (id, user_id, representada_id, cliente_id, numero, codigo_pedido, codigo_gerado, status, forma_pagamento, prazo_tipo, prazo_dias, origem)
  values (
    coalesce(p_id, gen_random_uuid()), v_uid, p_representada_id, p_cliente_id,
    proximo_numero_pedido(v_uid),
    nullif(btrim(p_codigo), ''), nullif(btrim(p_codigo), '') is null,
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
    if v_desc < 0 or v_desc > 100 then raise exception 'Desconto inválido para %', v_prod.nome; end if;
    v_acr := coalesce((v_item->>'acrescimo_percentual')::numeric, 0);
    if v_acr < 0 or v_acr > 100 then raise exception 'Acréscimo inválido para %', v_prod.nome; end if;

    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, acrescimo_percentual, desconto_acima_max, subtotal, comissao_percentual)
    values (v_id, v_prod.id, v_prod.nome, v_qtd, v_preco, v_desc, v_acr, v_desc > coalesce(v_desc_max, 0), round(v_qtd * v_preco * (1 + v_acr / 100) * (1 - v_desc / 100), 2), v_prod.comissao);
  end loop;

  update pedidos set valor_total = (select sum(subtotal) from pedido_itens where pedido_id = v_id) where id = v_id;

  if p_confirmar then perform confirmar_pedido(v_id); end if;
  return v_id;
end $$;
revoke execute on function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid, text, int, text) from public, anon;
grant execute on function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid, text, int, text) to authenticated;

create or replace function public.editar_pedido(
  p_pedido_id uuid, p_itens jsonb,
  p_forma_pagamento text default null, p_prazo_tipo text default 'a_vista', p_prazo_dias int default null,
  p_codigo text default null
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
  v_acr numeric(5,2);
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
    v_acr := coalesce((v_item->>'acrescimo_percentual')::numeric, 0);
    if v_acr < 0 or v_acr > 100 then raise exception 'Acréscimo inválido para %', v_prod.nome; end if;

    v_desc_max := null;
    select tp.desconto_max into v_desc_max from tabelas_preco tp
     where tp.produto_id = v_prod.id and (tp.cliente_id = v_ped.cliente_id or tp.cliente_id is null)
     order by tp.cliente_id nulls last limit 1;

    v_pct := coalesce((v_antigos->>v_prod.id::text)::numeric, v_prod.comissao);
    v_sub := round(v_qtd * v_preco * (1 + v_acr / 100) * (1 - v_desc / 100), 2);

    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, acrescimo_percentual,
                              desconto_acima_max, subtotal, comissao_percentual, comissao_valor)
    values (p_pedido_id, v_prod.id, v_prod.nome, v_qtd, v_preco, v_desc, v_acr, v_desc > coalesce(v_desc_max, 0), v_sub, v_pct,
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
         prazo_dias = case when coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' then p_prazo_dias end,
         codigo_pedido = case when not v_ped.codigo_gerado and nullif(btrim(p_codigo), '') is not null
                              then btrim(p_codigo) else codigo_pedido end
   where id = p_pedido_id;

  if v_confirmado then
    update comissoes
       set valor = v_com, percentual = case when v_total > 0 then round(v_com / v_total * 100, 2) else 0 end
     where pedido_id = p_pedido_id and status <> 'cancelada';
  end if;
end $$;
revoke execute on function public.editar_pedido(uuid, jsonb, text, text, int, text) from public, anon;
grant execute on function public.editar_pedido(uuid, jsonb, text, text, int, text) to authenticated;

create or replace function public.importar_pedidos(p_pedidos jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_ped jsonb;
  v_item jsonb;
  v_id uuid;
  v_n bigint;
  v_cod text;
  v_pend boolean;
  v_qtd numeric(12,3);
  v_preco numeric(12,2);
  v_desc numeric(5,2);
  v_acr numeric(5,2);
  v_prazo int;
  v_ins int := 0;
  v_itens int := 0;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_pedidos is null or jsonb_typeof(p_pedidos) <> 'array' then raise exception 'Lote inválido'; end if;
  if jsonb_array_length(p_pedidos) > 5000 then raise exception 'Lote acima de 5.000 pedidos'; end if;

  v_n := substring(proximo_numero_pedido(v_uid) from 2)::bigint - 1;  -- lock + base uma vez
  for v_ped in select * from jsonb_array_elements(p_pedidos) loop
    v_n := v_n + 1;
    v_cod := nullif(btrim(v_ped->>'codigo'), '');
    v_prazo := (v_ped->>'prazo_dias')::int;
    v_pend := exists (select 1 from jsonb_array_elements(v_ped->'itens') i where i->>'pendencia' = 'produto_nao_cadastrado');
    insert into pedidos (user_id, representada_id, cliente_id, numero, codigo_pedido, codigo_gerado, data, status,
                         forma_pagamento, prazo_tipo, prazo_dias, origem, observacoes, tem_pendencias)
    values (v_uid, (v_ped->>'representada_id')::uuid, (v_ped->>'cliente_id')::uuid, 'P' || lpad(v_n::text, 6, '0'),
            v_cod, v_cod is null, (v_ped->>'data')::date::timestamptz + interval '12 hours', 'rascunho',
            nullif(v_ped->>'forma_pagamento', ''), case when v_prazo is null then 'a_vista' else 'a_prazo' end, v_prazo,
            'importacao', nullif(left(btrim(v_ped->>'observacoes'), 500), ''), v_pend)
    returning id into v_id;

    for v_item in select * from jsonb_array_elements(v_ped->'itens') loop
      v_qtd := (v_item->>'quantidade')::numeric;
      v_preco := (v_item->>'preco_unitario')::numeric;
      v_desc := coalesce((v_item->>'desconto_percentual')::numeric, 0);
      v_acr := coalesce((v_item->>'acrescimo_percentual')::numeric, 0);
      insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, acrescimo_percentual,
                                subtotal, comissao_percentual, sku_planilha, pendencia)
      values (v_id, (v_item->>'produto_id')::uuid, nullif(left(btrim(v_item->>'descricao'), 200), ''), v_qtd, v_preco, v_desc, v_acr,
              round(v_qtd * v_preco * (1 + v_acr / 100) * (1 - v_desc / 100), 2), null, nullif(v_item->>'sku', ''), nullif(v_item->>'pendencia', ''));
      v_itens := v_itens + 1;
    end loop;

    update pedidos set valor_total = (select coalesce(sum(subtotal), 0) from pedido_itens where pedido_id = v_id) where id = v_id;
    -- sem produto pendente: confirmado (lança a comissão); com pendência (ou total zero): fica rascunho
    if not v_pend and (select valor_total from pedidos where id = v_id) > 0 then perform confirmar_pedido(v_id); end if;
    v_ins := v_ins + 1;
  end loop;
  return jsonb_build_object('inseridas', v_ins, 'atualizadas', 0, 'itens', v_itens);
end $$;
revoke execute on function public.importar_pedidos(jsonb) from public, anon;
grant execute on function public.importar_pedidos(jsonb) to authenticated;

create or replace view analise_itens with (security_invoker = true) as
 SELECT i.id AS item_id,
    p.id AS pedido_id,
    p.numero,
    p.data,
    (p.data AT TIME ZONE 'America/Sao_Paulo'::text)::date AS data_dia,
    p.status,
    p.origem AS canal,
    p.representada_id,
    r.razao_social AS representada_nome,
    p.cliente_id,
    c.nome AS cliente_nome,
    c.uf,
    c.cidade,
    i.produto_id,
    COALESCE(pr.nome, i.descricao) AS produto_nome,
    pr.sku,
    pr.categoria,
    i.quantidade,
    round(i.quantidade * i.preco_unitario * (1 + i.acrescimo_percentual / 100), 2) AS valor_bruto,
    round(i.quantidade * i.preco_unitario * (1 + i.acrescimo_percentual / 100), 2) - i.subtotal AS valor_desconto,
    i.subtotal AS valor_liquido
   FROM pedido_itens i
     JOIN pedidos p ON p.id = i.pedido_id
     JOIN representadas r ON r.id = p.representada_id
     LEFT JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN produtos pr ON pr.id = i.produto_id;
