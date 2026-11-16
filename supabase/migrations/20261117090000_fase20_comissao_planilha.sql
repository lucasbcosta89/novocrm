-- FASE 20 — "Comissão (R$)" no pedido (cálculo automático) + coluna na planilha de importação.
-- Decisões do usuário (item A):
--  A.1 percentual: precedência da Fase 19 (resolver_comissao_pct / resolverComissao).
--  A.2 pedido_itens.comissao_valor já existe: mesma base de cálculo (subtotal, que inclui acréscimo) — nada muda no
--      cálculo; nenhuma coluna nova para o valor.
--  A.3 formulário: somente leitura (ajuste manual depois, na página de Comissões).
--  A.5 zero NÃO é comissão legítima na planilha: zero = vazio = cálculo pelo cadastro + marca para análise.
--  F.3 a fila de análise (Fase 21) ainda não existe: as colunas de análise já nascem em comissoes
--      (completude, motivo_analise) e o status ganha 'pendente_analise' — nunca liquidado automaticamente.
-- Comissões já gravadas não são recalculadas.

-- item: de onde veio o valor da comissão e se a planilha deixou a comissão vazia/zerada
alter table pedido_itens
  add column comissao_origem text not null default 'calculada'
    constraint pedido_itens_comissao_origem_check check (comissao_origem in ('calculada', 'planilha')),
  add column comissao_planilha_ausente boolean not null default false;

-- comissão do pedido: completude e motivo de análise (handoff para a Fase 21)
alter table comissoes
  add column completude text not null default 'completa'
    constraint comissoes_completude_check check (completude in ('completa', 'incompleta')),
  add column motivo_analise text
    constraint comissoes_motivo_analise_check check (motivo_analise in ('comissao_zero_na_planilha', 'comissao_nao_definida'));
alter table comissoes drop constraint comissoes_status_check;
alter table comissoes add constraint comissoes_status_check
  check (status in ('a_receber', 'recebida', 'atrasada', 'cancelada', 'pendente_analise'));
create index comissoes_user_pendente_analise_idx on comissoes (user_id) where status = 'pendente_analise';
-- (marcar_comissoes_atrasadas só mexe em 'a_receber': 'pendente_analise' nunca muda sozinho)

-- emissão: valor informado na planilha (> 0) prevalece; o resto segue o cálculo existente (subtotal × %).
-- Item importado com comissão vazia/zerada → comissão do pedido incompleta e pendente de análise.
create or replace function confirmar_pedido(p_pedido_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ped pedidos%rowtype;
  v_total numeric(12,2);
  v_com numeric(12,2);
  v_ausente boolean;
  v_sem_valor boolean;
begin
  select * into v_ped from pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_ped.status <> 'rascunho' then raise exception 'Só pedidos em rascunho podem ser confirmados'; end if;

  update pedido_itens i
     set comissao_percentual = resolver_comissao_pct(p.comissao, r.comissao_percentual),
         comissao_valor = case when i.comissao_origem = 'planilha' then i.comissao_valor
                               else round(i.subtotal * resolver_comissao_pct(p.comissao, r.comissao_percentual) / 100, 2) end
    from produtos p join representadas r on r.id = p.representada_id
   where p.id = i.produto_id and i.pedido_id = p_pedido_id;

  select coalesce(sum(subtotal), 0), coalesce(sum(comissao_valor), 0),
         coalesce(bool_or(comissao_planilha_ausente), false),
         coalesce(bool_or(comissao_planilha_ausente and comissao_valor <= 0), false)
    into v_total, v_com, v_ausente, v_sem_valor
    from pedido_itens where pedido_id = p_pedido_id;
  if v_total <= 0 then raise exception 'Pedido sem itens'; end if;

  update pedidos set status = 'confirmado', valor_total = v_total, comissao_total = v_com where id = p_pedido_id;

  insert into cliente_representada (cliente_id, representada_id)
  values (v_ped.cliente_id, v_ped.representada_id) on conflict do nothing;

  insert into comissoes (user_id, representada_id, pedido_id, percentual, valor, status, data_prevista, completude, motivo_analise)
  values (
    v_ped.user_id, v_ped.representada_id, p_pedido_id,
    round(v_com / v_total * 100, 2), v_com,
    case when v_ausente then 'pendente_analise' else 'a_receber' end,
    (date_trunc('month', v_ped.data at time zone 'America/Sao_Paulo') + interval '1 month' - interval '1 second')
      at time zone 'America/Sao_Paulo',
    case when v_ausente then 'incompleta' else 'completa' end,
    case when not v_ausente then null when v_sem_valor then 'comissao_nao_definida' else 'comissao_zero_na_planilha' end
  );

  if auth.uid() is not null then perform recalcular_alertas_pedido(p_pedido_id); end if;
end $$;

-- edição: o valor da planilha é mantido enquanto o subtotal do item não mudar; senão volta ao cálculo
create or replace function editar_pedido(
  p_pedido_id uuid, p_itens jsonb, p_forma_pagamento text default null, p_prazo_tipo text default 'a_vista',
  p_prazo_dias integer default null, p_codigo text default null, p_data_faturamento date default null
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ped pedidos%rowtype;
  v_item jsonb;
  v_prod produtos%rowtype;
  v_rep_com numeric;
  v_antigos jsonb;
  v_ant jsonb;
  v_preco numeric(12,2);
  v_desc_max numeric(5,2);
  v_qtd numeric(12,3);
  v_desc numeric(5,2);
  v_acr numeric(5,2);
  v_pct numeric(5,2);
  v_sub numeric(12,2);
  v_val numeric(12,2);
  v_origem text;
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
  select comissao_percentual into v_rep_com from representadas where id = v_ped.representada_id;

  -- % já gravado de cada produto é mantido; o valor da planilha também (enquanto o subtotal não mudar)
  select coalesce(jsonb_object_agg(produto_id::text, jsonb_build_object(
           'pct', comissao_percentual, 'valor', comissao_valor, 'sub', subtotal, 'origem', comissao_origem, 'ausente', comissao_planilha_ausente)), '{}'::jsonb)
    into v_antigos
    from pedido_itens where pedido_id = p_pedido_id and produto_id is not null;
  delete from pedido_itens where pedido_id = p_pedido_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_prod from produtos
     where id = (v_item->>'produto_id')::uuid and representada_id = v_ped.representada_id;
    if not found then raise exception 'Produto não pertence à representada'; end if;
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

    v_ant := v_antigos->v_prod.id::text;
    v_pct := coalesce((v_ant->>'pct')::numeric, resolver_comissao_pct(v_prod.comissao, v_rep_com));
    v_sub := round(v_qtd * v_preco * (1 + v_acr / 100) * (1 - v_desc / 100), 2);
    if v_ant->>'origem' = 'planilha' and (v_ant->>'sub')::numeric = v_sub then
      v_origem := 'planilha';
      v_val := (v_ant->>'valor')::numeric;
    else
      v_origem := 'calculada';
      v_val := case when v_confirmado then round(v_sub * v_pct / 100, 2) else 0 end;
    end if;

    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, acrescimo_percentual,
                              desconto_acima_max, subtotal, comissao_percentual, comissao_valor, comissao_origem, comissao_planilha_ausente)
    values (p_pedido_id, v_prod.id, v_prod.nome, v_qtd, v_preco, v_desc, v_acr, v_desc > coalesce(v_desc_max, 0), v_sub, v_pct,
            v_val, v_origem, coalesce((v_ant->>'ausente')::boolean, false));
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
                              then btrim(p_codigo) else codigo_pedido end,
         data_faturamento = p_data_faturamento
   where id = p_pedido_id;

  if v_confirmado then
    update comissoes
       set valor = v_com, percentual = case when v_total > 0 then round(v_com / v_total * 100, 2) else 0 end
     where pedido_id = p_pedido_id and status <> 'cancelada';
  end if;

  perform recalcular_alertas_pedido(p_pedido_id);
end $$;

-- importação: item pode trazer comissao_valor (> 0, prevalece) ou comissao_ausente (célula vazia/zerada/fórmula sem valor)
create or replace function importar_pedidos(p_pedidos jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
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
  v_com numeric(12,2);
  v_prazo int;
  v_ins int := 0;
  v_itens int := 0;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_pedidos is null or jsonb_typeof(p_pedidos) <> 'array' then raise exception 'Lote inválido'; end if;
  if jsonb_array_length(p_pedidos) > 5000 then raise exception 'Lote acima de 5.000 pedidos'; end if;

  v_n := substring(proximo_numero_pedido(v_uid) from 2)::bigint - 1;
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
      v_com := nullif((v_item->>'comissao_valor')::numeric, 0);  -- zero = ausência (nunca aceito)
      if v_com is not null and v_com < 0 then raise exception 'Comissão negativa no lote'; end if;
      insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, acrescimo_percentual,
                                subtotal, comissao_percentual, comissao_valor, comissao_origem, comissao_planilha_ausente, sku_planilha, pendencia)
      values (v_id, (v_item->>'produto_id')::uuid, nullif(left(btrim(v_item->>'descricao'), 200), ''), v_qtd, v_preco, v_desc, v_acr,
              round(v_qtd * v_preco * (1 + v_acr / 100) * (1 - v_desc / 100), 2), null, v_com,
              case when v_com is not null then 'planilha' else 'calculada' end,
              v_com is null and coalesce((v_item->>'comissao_ausente')::boolean, false),
              nullif(v_item->>'sku', ''),
              case when v_item->>'pendencia' = 'produto_nao_cadastrado' then 'produto_nao_cadastrado' end);
      v_itens := v_itens + 1;
    end loop;

    update pedidos set valor_total = (select coalesce(sum(subtotal), 0) from pedido_itens where pedido_id = v_id) where id = v_id;
    if not v_pend and (select valor_total from pedidos where id = v_id) > 0 then
      perform confirmar_pedido(v_id);
    else
      perform recalcular_alertas_pedido(v_id);
    end if;
    v_ins := v_ins + 1;
  end loop;
  return jsonb_build_object('inseridas', v_ins, 'atualizadas', 0, 'itens', v_itens);
end $$;

-- Fase 19 (H.4): item com valor de comissão (ex.: informado na planilha) não é "comissão não definida"
create or replace function recalcular_alertas_pedido(p_pedido_id uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ped pedidos%rowtype;
  v_rep_com numeric;
  v_manual boolean;
  r record;
  v_desc_max numeric;
  v_preco_cat numeric;
  v_chaves text[] := '{}';
  v_resolvidos int := 0;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select * into v_ped from pedidos where id = p_pedido_id;
  if not found then raise exception 'Pedido não encontrado'; end if;
  v_manual := v_ped.origem <> 'importacao';
  select comissao_percentual into v_rep_com from representadas where id = v_ped.representada_id;

  if v_ped.status <> 'cancelado' then
    for r in
      select i.id, i.produto_id, i.preco_unitario, i.desconto_percentual, i.comissao_percentual, i.comissao_origem,
             p.comissao as com_cat, p.preco as preco_prod
        from pedido_itens i join produtos p on p.id = i.produto_id
       where i.pedido_id = p_pedido_id
    loop
      if v_manual then
        v_desc_max := null; v_preco_cat := null;
        select tp.desconto_max, tp.preco into v_desc_max, v_preco_cat from tabelas_preco tp
         where tp.produto_id = r.produto_id and (tp.cliente_id = v_ped.cliente_id or tp.cliente_id is null)
         order by tp.cliente_id nulls last limit 1;
        v_preco_cat := coalesce(v_preco_cat, r.preco_prod);
        if coalesce(v_desc_max, 0) > 0 and r.desconto_percentual > v_desc_max then
          perform registrar_alerta_pedido(p_pedido_id, v_ped.user_id, r.id, r.produto_id, 'desconto_acima_limite',
            jsonb_build_object('produto_id', r.produto_id, 'desconto_aplicado', r.desconto_percentual, 'desconto_maximo', v_desc_max));
          v_chaves := v_chaves || (r.produto_id::text || '|desconto_acima_limite');
        end if;
        if coalesce(v_preco_cat, 0) > 0 and abs(r.preco_unitario - v_preco_cat) >= 0.005 then
          perform registrar_alerta_pedido(p_pedido_id, v_ped.user_id, r.id, r.produto_id, 'preco_divergente',
            jsonb_build_object('produto_id', r.produto_id, 'preco_praticado', r.preco_unitario, 'preco_catalogo', v_preco_cat));
          v_chaves := v_chaves || (r.produto_id::text || '|preco_divergente');
        end if;
      end if;

      if coalesce(v_rep_com, 0) <= 0 and coalesce(r.com_cat, 0) > 0 then
        perform registrar_alerta_pedido(p_pedido_id, v_ped.user_id, r.id, r.produto_id, 'comissao_catalogo_sem_representada',
          jsonb_build_object('produto_id', r.produto_id, 'representada_id', v_ped.representada_id, 'comissao_representada', v_rep_com,
                             'comissao_catalogo', r.com_cat, 'origem_escolhida', 'catalogo'));
        v_chaves := v_chaves || (r.produto_id::text || '|comissao_catalogo_sem_representada');
      elsif coalesce(v_rep_com, 0) <= 0 and coalesce(r.com_cat, 0) <= 0 and coalesce(r.comissao_percentual, 0) <= 0
            and r.comissao_origem <> 'planilha' then
        perform registrar_alerta_pedido(p_pedido_id, v_ped.user_id, r.id, r.produto_id, 'comissao_nao_definida',
          jsonb_build_object('produto_id', r.produto_id, 'representada_id', v_ped.representada_id, 'comissao_representada', v_rep_com,
                             'comissao_catalogo', r.com_cat, 'origem_escolhida', 'zero'));
        v_chaves := v_chaves || (r.produto_id::text || '|comissao_nao_definida');
      end if;
    end loop;
  end if;

  update alertas_pedido set status = 'resolvido_auto', resolvido_em = now()
   where pedido_id = p_pedido_id and status = 'pendente'
     and (coalesce(produto_id::text, '') || '|' || tipo) <> all (v_chaves);
  get diagnostics v_resolvidos = row_count;
  return jsonb_build_object('ativos', cardinality(v_chaves), 'resolvidos', v_resolvidos);
end $$;
