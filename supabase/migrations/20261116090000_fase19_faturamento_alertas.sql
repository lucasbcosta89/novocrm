-- FASE 19 — Data de faturamento + alertas de divergência + precedência de comissão.
-- Decisões do usuário (item A):
--  A.1 pendências: pedido_itens.pendencia fica SÓ para vínculo ('produto_nao_cadastrado'); a pendência informativa
--      'preco_divergente' da importação deixa de existir (os 3 itens legados eram de pedidos importados, isentos de
--      alerta de preço). Divergências agora vivem em alertas_pedido.
--  A.2 desconto máximo: o EXISTENTE, tabelas_preco.desconto_max (tabela do cliente > padrão); limite 0/vazio = sem alerta.
--  A.3/A.4 comissão: catálogo = produtos.comissao; representada = representadas.comissao_percentual (= "comissão fixa").
--      Precedência INVERTIDA (antes: produto prevalecia) para pedidos criados/editados/emitidos a partir daqui.
--  A.5 origem: pedidos.origem já existe (app | catalogo_web | whatsapp | importacao). 'importacao' = importado por Excel;
--      os demais = manual. Nenhuma coluna nova, nenhum backfill (a Fase 17 já grava 'importacao').
-- Fora do escopo: valores de comissão já gravados, status/data prevista de comissão, relatórios da Fase 7, dashboard.
-- data_faturamento não entra em nenhum cálculo.

-- ---------- B.1 / B.2 ----------
alter table pedidos add column data_faturamento date;
create index if not exists pedidos_user_origem_idx on pedidos (user_id, origem);

-- ---------- A.1: pendência só de vínculo ----------
update pedido_itens set pendencia = null where pendencia = 'preco_divergente';
alter table pedido_itens drop constraint pedido_itens_pendencia_check;
alter table pedido_itens add constraint pedido_itens_pendencia_check check (pendencia = 'produto_nao_cadastrado');

-- ---------- D: precedência de comissão (espelho SQL de resolverComissao em lib/comissao.ts) ----------
-- D.1 representada > 0 e catálogo > 0 → representada (sem alerta)
-- D.2 representada > 0 e catálogo vazio → representada (oferta de propagação só na tela; nada é gravado no catálogo)
-- D.3 representada vazia e catálogo > 0 → catálogo (alerta comissao_catalogo_sem_representada)
-- D.4 nenhum → 0 (alerta comissao_nao_definida)
-- "vazio" = nulo ou 0.
create or replace function resolver_comissao_pct(p_catalogo numeric, p_representada numeric)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select (case when coalesce(p_representada, 0) > 0 then p_representada
               when coalesce(p_catalogo, 0) > 0 then p_catalogo
               else 0 end)::numeric
$$;

-- item gravado sem % (importação, catálogo público): aplica a precedência; % já gravado nunca é recalculado aqui
create or replace function pedido_itens_comissao_efetiva()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.comissao_percentual is null then
    select resolver_comissao_pct(p.comissao, r.comissao_percentual) into new.comissao_percentual
      from produtos p join representadas r on r.id = p.representada_id
     where p.id = new.produto_id;
    new.comissao_percentual := coalesce(new.comissao_percentual, 0);
  end if;
  if new.comissao_valor is null then
    new.comissao_valor := round(new.subtotal * new.comissao_percentual / 100, 2);
  end if;
  return new;
end $$;

-- ---------- B.5–B.8: alertas ----------
create table alertas_pedido (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references usuarios(id) on delete cascade,
  pedido_id uuid not null references pedidos(id) on delete cascade,
  -- a edição recria os itens: o alerta é reapontado ao item novo do mesmo produto no recálculo
  pedido_item_id uuid references pedido_itens(id) on delete set null,
  produto_id uuid references produtos(id) on delete set null,
  tipo text not null check (tipo in ('desconto_acima_limite', 'preco_divergente', 'comissao_nao_definida', 'comissao_catalogo_sem_representada')),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'corrigido', 'resolvido_auto')),
  valores jsonb not null default '{}',
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz
);
-- unicidade do alerta ATIVO: por item e tipo; sem item, por pedido (+ produto) e tipo. Aprovados ficam como histórico
-- (um aprovado que volta a ocorrer com OUTRO valor gera um alerta novo; com o mesmo valor, não reabre).
create unique index alertas_pedido_item_pendente_key on alertas_pedido (pedido_item_id, tipo)
  where status = 'pendente' and pedido_item_id is not null;
create unique index alertas_pedido_pendente_key on alertas_pedido (pedido_id, coalesce(produto_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo)
  where status = 'pendente';
create index alertas_pedido_user_status_idx on alertas_pedido (user_id, status);
create index alertas_pedido_pedido_idx on alertas_pedido (pedido_id);
create index alertas_pedido_tipo_idx on alertas_pedido (tipo);
create index alertas_pedido_produto_idx on alertas_pedido (produto_id);
create index alertas_pedido_item_idx on alertas_pedido (pedido_item_id);

alter table alertas_pedido enable row level security;
create policy alertas_pedido_dono on alertas_pedido for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from pedidos p where p.id = pedido_id and p.user_id = (select auth.uid())));

-- B.8 guarda de origem: pedido importado nunca recebe alerta de desconto/preço (comissão é permitida — H.4)
create or replace function alertas_pedido_guarda_origem()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.tipo in ('desconto_acima_limite', 'preco_divergente')
     and exists (select 1 from pedidos where id = new.pedido_id and origem = 'importacao') then
    raise exception 'Pedido importado por Excel não recebe alerta de desconto ou preço' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger alertas_pedido_guarda_origem before insert or update of tipo, pedido_id on alertas_pedido
  for each row execute function alertas_pedido_guarda_origem();

-- ---------- H: registro idempotente de UM alerta ----------
create or replace function registrar_alerta_pedido(p_pedido_id uuid, p_user uuid, p_item uuid, p_produto uuid, p_tipo text, p_valores jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_status text;
  v_valores jsonb;
begin
  -- ativo: atualiza os valores e reaponta o item (nunca duplica)
  update alertas_pedido set valores = p_valores, pedido_item_id = p_item
   where pedido_id = p_pedido_id and produto_id is not distinct from p_produto and tipo = p_tipo and status = 'pendente';
  if found then return; end if;

  select id, status, valores into v_id, v_status, v_valores from alertas_pedido
   where pedido_id = p_pedido_id and produto_id is not distinct from p_produto and tipo = p_tipo
   order by criado_em desc, id desc limit 1;
  -- aprovado com o mesmo valor: não reabre
  if found and v_status = 'aprovado' and v_valores = p_valores then return; end if;
  -- resolvido/corrigido que voltou a ocorrer: reabre o mesmo registro
  if found and v_status in ('resolvido_auto', 'corrigido') then
    update alertas_pedido set status = 'pendente', valores = p_valores, pedido_item_id = p_item, resolvido_em = null where id = v_id;
    return;
  end if;
  insert into alertas_pedido (user_id, pedido_id, pedido_item_id, produto_id, tipo, valores)
  values (p_user, p_pedido_id, p_item, p_produto, p_tipo, p_valores);
end $$;

-- ---------- H: recálculo de TODOS os itens do pedido (idempotente) ----------
-- G: desconto e preço só em pedido manual (origem <> 'importacao'); os dois tipos de comissão para qualquer origem.
-- D.5: item sem produto vinculado não gera alerta de comissão (a pendência de vínculo já cobre).
-- Pedido cancelado: nenhum alerta ativo.
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
      select i.id, i.produto_id, i.preco_unitario, i.desconto_percentual, i.comissao_percentual, p.comissao as com_cat, p.preco as preco_prod
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
      elsif coalesce(v_rep_com, 0) <= 0 and coalesce(r.com_cat, 0) <= 0 and coalesce(r.comissao_percentual, 0) <= 0 then
        perform registrar_alerta_pedido(p_pedido_id, v_ped.user_id, r.id, r.produto_id, 'comissao_nao_definida',
          jsonb_build_object('produto_id', r.produto_id, 'representada_id', v_ped.representada_id, 'comissao_representada', v_rep_com,
                             'comissao_catalogo', r.com_cat, 'origem_escolhida', 'zero'));
        v_chaves := v_chaves || (r.produto_id::text || '|comissao_nao_definida');
      end if;
    end loop;
  end if;

  -- o problema deixou de existir: resolvido automaticamente (aprovados nunca são tocados)
  update alertas_pedido set status = 'resolvido_auto', resolvido_em = now()
   where pedido_id = p_pedido_id and status = 'pendente'
     and (coalesce(produto_id::text, '') || '|' || tipo) <> all (v_chaves);
  get diagnostics v_resolvidos = row_count;
  return jsonb_build_object('ativos', cardinality(v_chaves), 'resolvidos', v_resolvidos);
end $$;

-- Reavalia os pedidos com alerta pendente de uma representada e/ou produto (após salvar comissão/preço no cadastro).
create or replace function recalcular_alertas_pendentes(p_representada_id uuid default null, p_produto_id uuid default null)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ped uuid;
  v_n int := 0;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  for v_ped in
    select distinct a.pedido_id from alertas_pedido a join pedidos p on p.id = a.pedido_id
     where a.status = 'pendente'
       and (p_representada_id is null or p.representada_id = p_representada_id)
       and (p_produto_id is null or a.produto_id = p_produto_id)
  loop
    perform recalcular_alertas_pedido(v_ped);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------- J: propagação manual (SÓ por clique; nenhum trigger/rotina chama esta função) ----------
create or replace function propagar_comissao_representada(p_representada_id uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_pct numeric;
  v_total int;
  v_upd int;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select comissao_percentual into v_pct from representadas where id = p_representada_id and excluido_em is null for update;
  if not found then raise exception 'Representada não encontrada'; end if;
  if coalesce(v_pct, 0) <= 0 then raise exception 'Defina a comissão da representada antes de aplicar aos produtos'; end if;
  select count(*) into v_total from produtos where representada_id = p_representada_id;
  -- idempotente: só produtos SEM comissão (nulo ou 0); os que já têm comissão são preservados
  update produtos set comissao = v_pct where representada_id = p_representada_id and coalesce(comissao, 0) <= 0;
  get diagnostics v_upd = row_count;
  perform recalcular_alertas_pendentes(p_representada_id, null);
  return jsonb_build_object('atualizados', v_upd, 'preservados', v_total - v_upd, 'percentual', v_pct);
end $$;

-- ---------- Pedidos: data de faturamento + precedência + recálculo dos alertas ----------
drop function criar_pedido(uuid, uuid, jsonb, text, boolean, uuid, text, integer, text);
create function criar_pedido(
  p_representada_id uuid, p_cliente_id uuid, p_itens jsonb, p_forma_pagamento text default null, p_confirmar boolean default false,
  p_id uuid default null, p_prazo_tipo text default 'a_vista', p_prazo_dias integer default null, p_codigo text default null,
  p_data_faturamento date default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_item jsonb;
  v_prod produtos%rowtype;
  v_rep_com numeric;
  v_preco numeric(12,2);
  v_desc_max numeric(5,2);
  v_qtd numeric(12,3);
  v_desc numeric(5,2);
  v_acr numeric(5,2);
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_id is not null and exists (select 1 from pedidos where id = p_id) then return p_id; end if;
  select comissao_percentual into v_rep_com from representadas where id = p_representada_id;
  if not found then raise exception 'Representada não encontrada'; end if;
  if not exists (select 1 from clientes where id = p_cliente_id) then raise exception 'Cliente não encontrado'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item';
  end if;
  if coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' and coalesce(p_prazo_dias, 0) < 1 then
    raise exception 'Informe o prazo em dias';
  end if;

  insert into pedidos (id, user_id, representada_id, cliente_id, numero, codigo_pedido, codigo_gerado, status, forma_pagamento, prazo_tipo, prazo_dias, origem, data_faturamento)
  values (
    coalesce(p_id, gen_random_uuid()), v_uid, p_representada_id, p_cliente_id,
    proximo_numero_pedido(v_uid),
    nullif(btrim(p_codigo), ''), nullif(btrim(p_codigo), '') is null,
    'rascunho', nullif(trim(p_forma_pagamento), ''), coalesce(p_prazo_tipo, 'a_vista'),
    case when coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' then p_prazo_dias end, 'app', p_data_faturamento
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
    values (v_id, v_prod.id, v_prod.nome, v_qtd, v_preco, v_desc, v_acr, v_desc > coalesce(v_desc_max, 0),
            round(v_qtd * v_preco * (1 + v_acr / 100) * (1 - v_desc / 100), 2), resolver_comissao_pct(v_prod.comissao, v_rep_com));
  end loop;

  update pedidos set valor_total = (select sum(subtotal) from pedido_itens where pedido_id = v_id) where id = v_id;

  if p_confirmar then perform confirmar_pedido(v_id); else perform recalcular_alertas_pedido(v_id); end if;
  return v_id;
end $$;

drop function editar_pedido(uuid, jsonb, text, text, integer, text);
create function editar_pedido(
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
  select comissao_percentual into v_rep_com from representadas where id = v_ped.representada_id;

  -- % já gravado de cada produto é mantido (nunca recalcular comissão de item gravado); só item novo resolve a precedência
  select coalesce(jsonb_object_agg(produto_id::text, comissao_percentual), '{}'::jsonb) into v_antigos
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

    v_pct := coalesce((v_antigos->>v_prod.id::text)::numeric, resolver_comissao_pct(v_prod.comissao, v_rep_com));
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

revoke execute on function criar_pedido(uuid, uuid, jsonb, text, boolean, uuid, text, integer, text, date) from public, anon;
grant execute on function criar_pedido(uuid, uuid, jsonb, text, boolean, uuid, text, integer, text, date) to authenticated;
revoke execute on function editar_pedido(uuid, jsonb, text, text, integer, text, date) from public, anon;
grant execute on function editar_pedido(uuid, jsonb, text, text, integer, text, date) to authenticated;

-- emissão: a comissão do item segue a precedência (Fase 7 inalterada: mesmo cálculo, mesma data prevista e status)
create or replace function confirmar_pedido(p_pedido_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ped pedidos%rowtype;
  v_total numeric(12,2);
  v_com numeric(12,2);
begin
  select * into v_ped from pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_ped.status <> 'rascunho' then raise exception 'Só pedidos em rascunho podem ser confirmados'; end if;

  update pedido_itens i
     set comissao_percentual = resolver_comissao_pct(p.comissao, r.comissao_percentual),
         comissao_valor = round(i.subtotal * resolver_comissao_pct(p.comissao, r.comissao_percentual) / 100, 2)
    from produtos p join representadas r on r.id = p.representada_id
   where p.id = i.produto_id and i.pedido_id = p_pedido_id;

  select coalesce(sum(subtotal), 0), coalesce(sum(comissao_valor), 0) into v_total, v_com
    from pedido_itens where pedido_id = p_pedido_id;
  if v_total <= 0 then raise exception 'Pedido sem itens'; end if;

  update pedidos set status = 'confirmado', valor_total = v_total, comissao_total = v_com where id = p_pedido_id;

  insert into cliente_representada (cliente_id, representada_id)
  values (v_ped.cliente_id, v_ped.representada_id) on conflict do nothing;

  insert into comissoes (user_id, representada_id, pedido_id, percentual, valor, status, data_prevista)
  values (
    v_ped.user_id, v_ped.representada_id, p_pedido_id,
    round(v_com / v_total * 100, 2), v_com, 'a_receber',
    (date_trunc('month', v_ped.data at time zone 'America/Sao_Paulo') + interval '1 month' - interval '1 second')
      at time zone 'America/Sao_Paulo'
  );

  if auth.uid() is not null then perform recalcular_alertas_pedido(p_pedido_id); end if;
end $$;

-- G.4: importação grava origem 'importacao' (já gravava) e avalia SÓ os alertas de comissão (guarda + isenção)
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
      insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, acrescimo_percentual,
                                subtotal, comissao_percentual, sku_planilha, pendencia)
      values (v_id, (v_item->>'produto_id')::uuid, nullif(left(btrim(v_item->>'descricao'), 200), ''), v_qtd, v_preco, v_desc, v_acr,
              round(v_qtd * v_preco * (1 + v_acr / 100) * (1 - v_desc / 100), 2), null, nullif(v_item->>'sku', ''),
              case when v_item->>'pendencia' = 'produto_nao_cadastrado' then 'produto_nao_cadastrado' end);
      v_itens := v_itens + 1;
    end loop;

    update pedidos set valor_total = (select coalesce(sum(subtotal), 0) from pedido_itens where pedido_id = v_id) where id = v_id;
    if not v_pend and (select valor_total from pedidos where id = v_id) > 0 then
      perform confirmar_pedido(v_id);  -- já recalcula os alertas
    else
      perform recalcular_alertas_pedido(v_id);
    end if;
    v_ins := v_ins + 1;
  end loop;
  return jsonb_build_object('inseridas', v_ins, 'atualizadas', 0, 'itens', v_itens);
end $$;

revoke execute on function resolver_comissao_pct(numeric, numeric) from public, anon;
grant execute on function resolver_comissao_pct(numeric, numeric) to authenticated;
revoke execute on function registrar_alerta_pedido(uuid, uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function registrar_alerta_pedido(uuid, uuid, uuid, uuid, text, jsonb) to authenticated;
revoke execute on function recalcular_alertas_pedido(uuid) from public, anon;
grant execute on function recalcular_alertas_pedido(uuid) to authenticated;
revoke execute on function recalcular_alertas_pendentes(uuid, uuid) from public, anon;
grant execute on function recalcular_alertas_pendentes(uuid, uuid) to authenticated;
revoke execute on function propagar_comissao_representada(uuid) from public, anon;
grant execute on function propagar_comissao_representada(uuid) to authenticated;
