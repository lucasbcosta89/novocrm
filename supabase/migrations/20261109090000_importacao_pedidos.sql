-- FASE 17 — Importação de pedidos por planilha (motor genérico das Fases 15/16).
-- Decisões (confirmadas com o usuário): cliente pelo CNPJ/CPF; representada deduzida pelo SKU; migration MÍNIMA
-- só para guardar pendências de produto (cliente não encontrado = linha inválida, cliente_id segue obrigatório);
-- pedidos importados entram confirmados (comissão lançada), exceto os que têm produto pendente (rascunho).

-- 1) pendências: pedido marcado + item com o SKU da planilha e o motivo
alter table pedidos add column tem_pendencias boolean not null default false;
alter table pedido_itens
  add column sku_planilha text check (sku_planilha is null or length(sku_planilha) <= 60),
  add column pendencia text check (pendencia in ('produto_nao_cadastrado', 'preco_divergente'));
create index pedido_itens_pendentes_idx on pedido_itens (sku_planilha) where pendencia = 'produto_nao_cadastrado';
alter table importacoes drop constraint importacoes_tipo_check;
alter table importacoes add constraint importacoes_tipo_check check (tipo in ('produtos', 'representadas', 'clientes', 'pedidos'));

-- 2) numeração única do número interno (P + 6 dígitos, série existente): maior número do usuário no padrão P<dígitos>
-- + 1, com advisory lock por usuário (até o fim da transação) — sem colisão em criações/importações simultâneas.
-- Códigos próprios do cliente (1001, ERP-77) ficam em codigo_pedido e não deslocam a série.
create function public.proximo_numero_pedido(p_user uuid) returns text
language plpgsql set search_path = public, pg_temp as $$
declare v_max bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('pedidos:' || p_user::text, 0));
  select coalesce(max(substring(numero from 2)::bigint), 0) into v_max
    from pedidos where user_id = p_user and numero ~ '^P[0-9]+$';
  return 'P' || lpad((v_max + 1)::text, 6, '0');
end $$;
revoke execute on function public.proximo_numero_pedido(uuid) from public, anon;
grant execute on function public.proximo_numero_pedido(uuid) to authenticated;

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

    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, desconto_acima_max, subtotal, comissao_percentual)
    values (v_id, v_prod.id, v_prod.nome, v_qtd, v_preco, v_desc, v_desc > coalesce(v_desc_max, 0), round(v_qtd * v_preco * (1 - v_desc / 100), 2), v_prod.comissao);
  end loop;

  update pedidos set valor_total = (select sum(subtotal) from pedido_itens where pedido_id = v_id) where id = v_id;

  if p_confirmar then perform confirmar_pedido(v_id); end if;
  return v_id;
end $$;
revoke execute on function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid, text, int, text) from public, anon;
grant execute on function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid, text, int, text) to authenticated;

create or replace function public.criar_pedido_publico(p_slug text, p_cliente jsonb, p_itens jsonb, p_observacoes text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rep representadas%rowtype;
  v_cli uuid;
  v_id uuid;
  v_num text;
  v_wpp text := regexp_replace(coalesce(p_cliente->>'whatsapp', ''), '\D', '', 'g');
  v_doc text := nullif(regexp_replace(coalesce(p_cliente->>'documento', ''), '\D', '', 'g'), '');
  v_item jsonb;
  v_prod produtos%rowtype;
  v_preco numeric(12,2);
  v_qtd numeric(12,3);
begin
  select * into v_rep from representadas where slug = p_slug and catalogo_publico and criar_pedido_publico;
  if not found then raise exception 'Este catálogo não está recebendo pedidos'; end if;
  if length(v_wpp) < 10 then raise exception 'Informe um WhatsApp válido com DDD'; end if;
  -- Fase 16: cliente sem CNPJ/CPF não é aceito
  if v_doc is null then raise exception 'Informe o CNPJ ou CPF'; end if;
  if not ((length(v_doc) = 11 and cpf_valido(v_doc)) or (length(v_doc) = 14 and cnpj_valido(v_doc))) then
    raise exception 'CNPJ/CPF inválido: confira os números';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item';
  end if;
  -- proteção simples contra abuso do endpoint público
  if (select count(*) from pedidos where representada_id = v_rep.id and origem = 'catalogo_web'
        and criado_em > now() - interval '10 minutes') >= 20 then
    raise exception 'Muitos pedidos em sequência. Tente novamente em alguns minutos.';
  end if;

  select id into v_cli from clientes
   where user_id = v_rep.user_id
     and ((v_doc is not null and documento = v_doc)
          or regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') = v_wpp
          or regexp_replace(coalesce(celular, ''), '\D', '', 'g') = v_wpp)
   order by (documento = v_doc) desc nulls last
   limit 1;
  if v_cli is null then
    insert into clientes (user_id, nome, documento, whatsapp, email, cidade, uf, anotacoes)
    values (v_rep.user_id, left(trim(p_cliente->>'nome'), 160), v_doc, v_wpp,
            nullif(lower(trim(p_cliente->>'email')), ''), nullif(trim(p_cliente->>'cidade'), ''),
            nullif(upper(trim(p_cliente->>'uf')), ''), 'Cadastrado pelo catálogo digital')
    returning id into v_cli;
  else
    -- cliente antigo sem documento (achado pelo WhatsApp): completa com o CNPJ/CPF informado, se livre
    update clientes set documento = v_doc
     where id = v_cli and documento is null
       and not exists (select 1 from clientes where user_id = v_rep.user_id and documento = v_doc);
  end if;
  insert into cliente_representada (cliente_id, representada_id) values (v_cli, v_rep.id) on conflict do nothing;

  v_num := proximo_numero_pedido(v_rep.user_id);
  insert into pedidos (user_id, representada_id, cliente_id, numero, status, origem, observacoes)
  values (v_rep.user_id, v_rep.id, v_cli, v_num, 'rascunho', 'catalogo_web', nullif(left(trim(p_observacoes), 1000), ''))
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_prod from produtos where id = (v_item->>'produto_id')::uuid and representada_id = v_rep.id and ativo;
    if not found then raise exception 'Produto indisponível'; end if;
    v_qtd := (v_item->>'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 or v_qtd > 100000 then raise exception 'Quantidade inválida para %', v_prod.nome; end if;
    v_preco := null;
    select tp.preco into v_preco from tabelas_preco tp
     where tp.produto_id = v_prod.id and (tp.cliente_id = v_cli or tp.cliente_id is null)
     order by tp.cliente_id nulls last limit 1;
    v_preco := coalesce(v_preco, v_prod.preco);
    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, subtotal, comissao_percentual)
    values (v_id, v_prod.id, v_prod.nome, v_qtd, v_preco, round(v_qtd * v_preco, 2), v_prod.comissao);
  end loop;

  update pedidos set valor_total = (select sum(subtotal) from pedido_itens where pedido_id = v_id) where id = v_id;
  return jsonb_build_object('pedido_id', v_id, 'numero', v_num, 'user_id', v_rep.user_id, 'cliente_id', v_cli,
    'valor_total', (select valor_total from pedidos where id = v_id));
end $$;
revoke execute on function public.criar_pedido_publico(text, jsonb, jsonb, text) from public, anon, authenticated;

-- 3) importar_pedidos: UMA chamada = UMA transação (qualquer erro desfaz o lote inteiro).
-- p_pedidos: [{ codigo, data, cliente_id, representada_id, forma_pagamento, prazo_dias, observacoes,
--              itens: [{ produto_id, sku, descricao, quantidade, preco_unitario, desconto_percentual, pendencia }] }]
-- Preço gravado = o da planilha (nunca o do Catálogo). Número: base obtida UMA vez (lock por usuário) e incrementada.
create function public.importar_pedidos(p_pedidos jsonb) returns jsonb
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
      insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual,
                                subtotal, comissao_percentual, sku_planilha, pendencia)
      values (v_id, (v_item->>'produto_id')::uuid, nullif(left(btrim(v_item->>'descricao'), 200), ''), v_qtd, v_preco, v_desc,
              round(v_qtd * v_preco * (1 - v_desc / 100), 2), null, nullif(v_item->>'sku', ''), nullif(v_item->>'pendencia', ''));
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

-- 4) vincular_produto_pendente: depois que o produto é cadastrado no Catálogo, liga a ele os itens pendentes com o
-- mesmo SKU nos pedidos da MESMA representada; o preço do item não muda. Recalcula tem_pendencias.
create function public.vincular_produto_pendente(p_produto_id uuid) returns int
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_prod produtos%rowtype;
  v_pedidos uuid[];
  v_qtd int;
begin
  select * into v_prod from produtos where id = p_produto_id;
  if not found then raise exception 'Produto não encontrado'; end if;
  with alvo as (
    update pedido_itens i
       set produto_id = v_prod.id, pendencia = null, descricao = coalesce(i.descricao, v_prod.nome)
      from pedidos p
     where p.id = i.pedido_id and p.representada_id = v_prod.representada_id
       and i.produto_id is null and i.pendencia = 'produto_nao_cadastrado' and i.sku_planilha = v_prod.sku
    returning i.pedido_id
  )
  select coalesce(array_agg(distinct pedido_id), '{}'), count(*) into v_pedidos, v_qtd from alvo;
  -- comando separado: enxerga os itens já vinculados
  update pedidos p
     set tem_pendencias = exists (select 1 from pedido_itens x where x.pedido_id = p.id and x.pendencia = 'produto_nao_cadastrado')
   where p.id = any (v_pedidos);
  return v_qtd;
end $$;
revoke execute on function public.vincular_produto_pendente(uuid) from public, anon;
grant execute on function public.vincular_produto_pendente(uuid) to authenticated;
