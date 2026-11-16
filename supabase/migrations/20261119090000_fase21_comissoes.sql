-- FASE 21 — Comissões: status, filtro temporal, precedência, completude, fila de análise, aprovação em lote e
-- edição de data.
-- Decisões do usuário (item A):
--  A.1/B.4 status legados (contagem antes: a_receber=4, recebida=10; atrasada/cancelada/pendente_analise=0):
--      a_receber → prevista; atrasada → prevista; recebida → recebida; pendente_analise → pendente_analise;
--      'cancelada' MANTIDA como 5º status técnico, fora de todos os grupos e totais (cancelar pedido continua).
--  A.2 propagação MANUAL (botão "Aplicar a todos os produtos"); alerta 'comissao_catalogo_sem_representada' REMOVIDO
--      do motor (pendentes desse tipo → resolvido_auto; o tipo fica no CHECK só como histórico).
--  A.3 "Comissão fixa" = representadas.comissao_percentual (o mesmo campo da Fase 7/19).
--  A.4 data de upload = pedidos.criado_em (não há vínculo pedido → importacoes).
--  A.5 liquidação retroativa: SIM, execução única nesta migration, só importados COMPLETOS.
--  A.6 filtro temporal: previsão de recebimento por padrão (seletor na tela).
--  A.7 prazo do cliente = pedidos.prazo_tipo/prazo_dias, à vista = 0 dias (definido); prazo da comissão = Fase 18.
--  Legado: comissões em aberto REAVALIADAS (completude/motivos/previsão); valores NÃO mudam; recebidas intactas.
-- Colunas equivalentes MAPEADAS (C.13): data_prevista (timestamptz) → data_prevista_recebimento (date, recalculada
-- pela regra E); recebida_em (timestamptz) → data_recebimento (date); motivo_analise (texto) → motivos_pendencia (text[]).
-- As colunas antigas são removidas (nenhuma duplicata). O job diário 'comissoes-atrasadas' é desligado: 'atrasada'
-- deixa de existir (vencida = prevista com previsão < hoje, derivado na tela).

-- ---------- C: colunas ----------
alter table comissoes
  add column data_prevista_recebimento date,
  add column data_recebimento date,
  add column origem_calculo text constraint comissoes_origem_calculo_check check (origem_calculo in ('representada', 'catalogo', 'manual', 'zero')),
  add column liquidada_automaticamente boolean not null default false,
  add column reaberta_em timestamptz,
  add column reaberta_por uuid,
  add column motivos_pendencia text[] not null default '{}'
    constraint comissoes_motivos_pendencia_check check (motivos_pendencia <@ array['comissao_nao_definida', 'comissao_zero_na_planilha',
      'sem_data_faturamento', 'sem_prazo_pagamento_comissao', 'sem_prazo_cliente']::text[]),
  add column lote_aprovacao_id uuid,
  add column aprovada_em timestamptz,
  add column aprovada_por uuid,
  add column data_recebimento_editada boolean not null default false,
  add column editada_em timestamptz,
  add column editada_por uuid;

-- mapeamento das colunas equivalentes
update comissoes set motivos_pendencia = array[motivo_analise] where motivo_analise is not null;
update comissoes set data_recebimento = (recebida_em at time zone 'America/Sao_Paulo')::date where status = 'recebida' and recebida_em is not null;
update comissoes set data_recebimento = (data_prevista at time zone 'America/Sao_Paulo')::date where status = 'recebida' and data_recebimento is null and data_prevista is not null;
update comissoes set data_prevista_recebimento = (data_prevista at time zone 'America/Sao_Paulo')::date where data_prevista is not null;

-- B.4: status legados (em transação: a migration inteira é atômica)
alter table comissoes drop constraint comissoes_status_check;
update comissoes set status = 'prevista' where status in ('a_receber', 'atrasada');
alter table comissoes add constraint comissoes_status_check check (status in ('prevista', 'recebida', 'reaberta', 'pendente_analise', 'cancelada'));
alter table comissoes alter column status set default 'prevista';

alter table comissoes drop column motivo_analise, drop column data_prevista, drop column recebida_em;

-- C.12: índices
create index if not exists comissoes_user_prevista_idx on comissoes (user_id, data_prevista_recebimento);
create index if not exists comissoes_user_status_idx2 on comissoes (user_id, status);
create index if not exists comissoes_pedido_idx on comissoes (pedido_id);
create index if not exists comissoes_user_completude_idx on comissoes (user_id, completude);
create index if not exists comissoes_user_lote_idx on comissoes (user_id, lote_aprovacao_id);
create index if not exists comissoes_user_status_receb_idx on comissoes (user_id, status, data_recebimento);

-- ---------- C.11 / L: histórico (somente leitura para o usuário) ----------
create table comissoes_historico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  comissao_id uuid not null references comissoes(id) on delete cascade,
  campo text not null,
  valor_anterior text,
  valor_novo text,
  autor uuid,
  lote_aprovacao_id uuid,
  motivo text,
  criado_em timestamptz not null default now()
);
create index comissoes_historico_comissao_idx on comissoes_historico (comissao_id, criado_em desc);
create index comissoes_historico_user_idx on comissoes_historico (user_id);
alter table comissoes_historico enable row level security;
create policy comissoes_historico_leitura on comissoes_historico for select to authenticated using ((select auth.uid()) = user_id);

-- log dos lotes (aprovação e reabertura): autor, data, quantidade, valor total, filtro e motivos presentes (I.8 / J.4)
create table comissoes_lotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references usuarios(id) on delete cascade,
  tipo text not null check (tipo in ('aprovacao', 'reabertura')),
  lote_ref uuid,
  autor uuid,
  quantidade int not null,
  valor_total numeric(12,2) not null,
  filtro jsonb not null default '{}',
  motivos jsonb not null default '{}',
  criado_em timestamptz not null default now()
);
create index comissoes_lotes_user_idx on comissoes_lotes (user_id, criado_em desc);
alter table comissoes_lotes enable row level security;
create policy comissoes_lotes_leitura on comissoes_lotes for select to authenticated using ((select auth.uid()) = user_id);
create policy comissoes_lotes_insercao on comissoes_lotes for insert to authenticated with check ((select auth.uid()) = user_id);

-- L.2: TODA alteração de status e de data_recebimento vai para o histórico. Autor = usuário da sessão, exceto
-- quando a rotina marca 'plurima.hist_sem_autor' (liquidação automática: autor NULL, motivo 'rotina').
-- security definer: o usuário não tem INSERT na tabela (histórico somente leitura); só este gatilho escreve.
create or replace function comissoes_registrar_historico()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_autor uuid := case when coalesce(current_setting('plurima.hist_sem_autor', true), '') = '1' then null else auth.uid() end;
  v_motivo text := nullif(current_setting('plurima.hist_motivo', true), '');
  v_lote uuid := nullif(current_setting('plurima.hist_lote', true), '')::uuid;
begin
  if new.status is distinct from old.status then
    insert into comissoes_historico (user_id, comissao_id, campo, valor_anterior, valor_novo, autor, lote_aprovacao_id, motivo)
    values (new.user_id, new.id, 'status', old.status, new.status, v_autor, v_lote, v_motivo);
  end if;
  if new.data_recebimento is distinct from old.data_recebimento then
    insert into comissoes_historico (user_id, comissao_id, campo, valor_anterior, valor_novo, autor, lote_aprovacao_id, motivo)
    values (new.user_id, new.id, 'data_recebimento', old.data_recebimento::text, new.data_recebimento::text, v_autor, v_lote, v_motivo);
  end if;
  return null;
end $$;
revoke execute on function comissoes_registrar_historico() from public, anon, authenticated;
create trigger comissoes_historico after update of status, data_recebimento on comissoes
  for each row execute function comissoes_registrar_historico();

create or replace function definir_contexto_historico(p_motivo text, p_lote uuid default null, p_sem_autor boolean default false)
returns void
language sql
set search_path = public, pg_temp
as $$
  select set_config('plurima.hist_motivo', coalesce(p_motivo, ''), true),
         set_config('plurima.hist_lote', coalesce(p_lote::text, ''), true),
         set_config('plurima.hist_sem_autor', case when p_sem_autor then '1' else '' end, true);
$$;

create or replace function hoje_sp() returns date language sql stable set search_path = public, pg_temp
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- ---------- E: data prevista de recebimento (espelho de calcularPrevisaoRecebimento em lib/comissoes/regras.ts) ----------
-- Base = data de faturamento.
--  E.1 tipo 'faturamento' → faturamento
--  E.2 tipo 'pagamento'   → faturamento + prazo do cliente (à vista = 0)
--  E.3 'outro' + 'faturamento' → faturamento + dias
--  E.4 'outro' + 'pagamento'   → faturamento + prazo do cliente + dias
--  E.5 faltou insumo → ESTIMATIVA (sem faturamento usa a data do pedido; prazo/dias ausentes = 0); nunca liquida.
--  E.6 sem faturamento e sem data do pedido → NULL ("Sem previsão"), com o motivo gravado pela completude.
create or replace function calcular_previsao_recebimento(
  p_data_faturamento date, p_data_pedido date, p_prazo_tipo text, p_prazo_dias int, p_tipo text, p_ref text, p_dias int,
  out previsao date, out estimativa boolean)
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_base date := coalesce(p_data_faturamento, p_data_pedido);
  v_cli int;
begin
  estimativa := p_data_faturamento is null;
  if v_base is null then previsao := null; estimativa := true; return; end if;
  v_cli := case when coalesce(p_prazo_tipo, 'a_vista') = 'a_vista' then 0 else p_prazo_dias end;
  if p_tipo is null then
    estimativa := true; previsao := v_base;
  elsif p_tipo = 'faturamento' then
    previsao := v_base;
  elsif p_tipo = 'pagamento' then
    if v_cli is null then estimativa := true; end if;
    previsao := v_base + coalesce(v_cli, 0);
  else -- 'outro'
    if p_dias is null or p_ref is null then estimativa := true; end if;
    if p_ref = 'pagamento' then
      if v_cli is null then estimativa := true; end if;
      previsao := v_base + coalesce(v_cli, 0) + coalesce(p_dias, 0);
    else
      previsao := v_base + coalesce(p_dias, 0);
    end if;
  end if;
end $$;

-- ---------- F: completude (espelho de verificarCompletudeComissao em lib/comissoes/regras.ts) ----------
--  F.1 (a) comissão definida: % resolvido > 0 OU valor da planilha > 0 (ZERO não define; manual > 0 define).
--          'comissao_zero_na_planilha' = planilha vazia/zerada com % para calcular; 'comissao_nao_definida' = sem %.
--      (b) data de faturamento → 'sem_data_faturamento'
--      (c) prazo de pagamento da comissão na representada (tipo; 'outro' exige referência e dias) → 'sem_prazo_pagamento_comissao'
--      (d) tipo 'pagamento' ou 'outro'+'pagamento' exige prazo do cliente (à vista = 0) → 'sem_prazo_cliente'
--  F.4 item sem produto NÃO é isento (o % dele vem da representada — D.4).
create or replace function verificar_completude_comissao(p_comissao_id uuid,
  out completa boolean, out motivos text[], out previsao date, out estimativa boolean, out origem text)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  c comissoes%rowtype;
  p pedidos%rowtype;
  r representadas%rowtype;
  v_nao_def boolean;
  v_zero_pl boolean;
  v_pv record;
begin
  select * into c from comissoes where id = p_comissao_id;
  select * into p from pedidos where id = c.pedido_id;
  select * into r from representadas where id = c.representada_id;
  motivos := '{}';

  select coalesce(bool_or(not (i.comissao_origem = 'planilha' and i.comissao_valor > 0) and coalesce(i.comissao_percentual, 0) <= 0), false),
         coalesce(bool_or(i.comissao_planilha_ausente and coalesce(i.comissao_percentual, 0) > 0), false),
         case when bool_and(coalesce(i.origem_calculo, case when coalesce(i.comissao_percentual, 0) <= 0 then 'zero' end) = 'zero') then 'zero'
              when bool_or(coalesce(i.origem_calculo, case when i.comissao_percentual = r.comissao_percentual then 'representada' end) = 'representada') then 'representada'
              else 'catalogo' end
    into v_nao_def, v_zero_pl, origem
    from pedido_itens i where i.pedido_id = c.pedido_id;

  if c.origem_calculo = 'manual' then
    origem := 'manual';
    if c.valor <= 0 then motivos := motivos || 'comissao_nao_definida'::text; end if;
  else
    if v_nao_def then motivos := motivos || 'comissao_nao_definida'::text; end if;
    if v_zero_pl then motivos := motivos || 'comissao_zero_na_planilha'::text; end if;
  end if;
  if p.data_faturamento is null then motivos := motivos || 'sem_data_faturamento'::text; end if;
  if r.comissao_pagamento_tipo is null
     or (r.comissao_pagamento_tipo = 'outro' and (r.comissao_pagamento_dias is null or r.comissao_pagamento_referencia is null)) then
    motivos := motivos || 'sem_prazo_pagamento_comissao'::text;
  end if;
  if (r.comissao_pagamento_tipo = 'pagamento' or (r.comissao_pagamento_tipo = 'outro' and r.comissao_pagamento_referencia = 'pagamento'))
     and p.prazo_tipo = 'a_prazo' and p.prazo_dias is null then
    motivos := motivos || 'sem_prazo_cliente'::text;
  end if;
  completa := cardinality(motivos) = 0;
  select * into v_pv from calcular_previsao_recebimento(p.data_faturamento, (p.data at time zone 'America/Sao_Paulo')::date,
    p.prazo_tipo, p.prazo_dias, r.comissao_pagamento_tipo, r.comissao_pagamento_referencia, r.comissao_pagamento_dias);
  previsao := v_pv.previsao;
  estimativa := v_pv.estimativa or not completa;
end $$;

-- F.2 / F.3 / F.5: grava completude, motivos, previsão e origem; ajusta o status. Recebida/cancelada: intocadas
-- (motivos preservados para auditoria). Data de recebimento digitada por humano: status não muda (K/L.3).
-- Ficou completa: sai de 'pendente_analise' para 'prevista' (elegível a G). NUNCA promove a 'recebida' aqui.
create or replace function avaliar_comissao(p_comissao_id uuid)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  c comissoes%rowtype;
  v record;
  v_status text;
begin
  select * into c from comissoes where id = p_comissao_id for update;
  if not found then return null; end if;
  if c.status in ('recebida', 'cancelada') then return c.status; end if;
  select * into v from verificar_completude_comissao(p_comissao_id);
  v_status := case when c.data_recebimento_editada and c.data_recebimento is not null then c.status
                   when not v.completa then 'pendente_analise'
                   when c.status = 'pendente_analise' then 'prevista'
                   else c.status end;
  perform definir_contexto_historico('completude');
  update comissoes
     set completude = case when v.completa then 'completa' else 'incompleta' end,
         motivos_pendencia = v.motivos, data_prevista_recebimento = v.previsao, origem_calculo = v.origem, status = v_status
   where id = p_comissao_id;
  perform definir_contexto_historico(null);
  return v_status;
end $$;

-- ---------- G: liquidação automática (SÓ completa; SÓ importado; previsão anterior ao upload) ----------
-- Idempotente: só 'prevista' nunca reaberta, nunca aprovada/analisada manualmente e sem data editada por humano (L.3).
create or replace function liquidar_comissoes(p_pedidos uuid[] default null)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  perform definir_contexto_historico('rotina', null, true);
  update comissoes c
     set status = 'recebida', data_recebimento = c.data_prevista_recebimento, liquidada_automaticamente = true
    from pedidos p
   where p.id = c.pedido_id and p.origem = 'importacao'
     and c.completude = 'completa' and c.status = 'prevista'
     and c.data_prevista_recebimento is not null
     and c.data_prevista_recebimento < (p.criado_em at time zone 'America/Sao_Paulo')::date
     and not c.data_recebimento_editada and c.reaberta_em is null and c.aprovada_em is null
     and (p_pedidos is null or p.id = any (p_pedidos));
  get diagnostics v_n = row_count;
  perform definir_contexto_historico(null);
  return v_n;
end $$;

-- reavalia (F.5) as comissões abertas de um pedido ou representada e roda G para os importados
create or replace function reavaliar_comissoes(p_pedido_id uuid default null, p_representada_id uuid default null)
returns int
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_peds uuid[] := '{}';
  v_n int := 0;
begin
  for v_id in
    select c.id from comissoes c
     where c.status not in ('recebida', 'cancelada')
       and (p_pedido_id is null or c.pedido_id = p_pedido_id)
       and (p_representada_id is null or c.representada_id = p_representada_id)
       and (p_pedido_id is not null or p_representada_id is not null)
  loop
    perform avaliar_comissao(v_id);
    v_n := v_n + 1;
  end loop;
  select coalesce(array_agg(distinct c.pedido_id), '{}') into v_peds from comissoes c
   where (p_pedido_id is null or c.pedido_id = p_pedido_id) and (p_representada_id is null or c.representada_id = p_representada_id)
     and (p_pedido_id is not null or p_representada_id is not null);
  perform liquidar_comissoes(v_peds);
  return v_n;
end $$;

-- gatilhos de correção (F.5): data de faturamento / prazo do cliente no pedido; prazo da comissão na representada
create or replace function pedidos_reavaliar_comissoes() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  perform reavaliar_comissoes(new.id, null);
  return null;
end $$;
create trigger pedidos_reavaliar_comissoes after update of data_faturamento, prazo_tipo, prazo_dias on pedidos
  for each row when (old.data_faturamento is distinct from new.data_faturamento or old.prazo_tipo is distinct from new.prazo_tipo
                     or old.prazo_dias is distinct from new.prazo_dias)
  execute function pedidos_reavaliar_comissoes();

create or replace function representadas_reavaliar_comissoes() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  perform reavaliar_comissoes(null, new.id);
  return null;
end $$;
create trigger representadas_reavaliar_comissoes after update of comissao_pagamento_tipo, comissao_pagamento_referencia, comissao_pagamento_dias on representadas
  for each row when (old.comissao_pagamento_tipo is distinct from new.comissao_pagamento_tipo
                     or old.comissao_pagamento_referencia is distinct from new.comissao_pagamento_referencia
                     or old.comissao_pagamento_dias is distinct from new.comissao_pagamento_dias)
  execute function representadas_reavaliar_comissoes();

-- ---------- Ações do usuário (RLS por user_id; security invoker) ----------
-- 'Marcar como recebida' (prevista/reaberta) e H.4 'Analisar e marcar como recebida' (vale com dados incompletos:
-- decisão do usuário; grava autor e data e LIMPA os motivos).
create or replace function marcar_comissao_recebida(p_id uuid, p_analise boolean default false)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare c comissoes%rowtype;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select * into c from comissoes where id = p_id for update;
  if not found then raise exception 'Comissão não encontrada'; end if;
  if c.status in ('recebida', 'cancelada') then raise exception 'Comissão já recebida ou cancelada'; end if;
  if c.status = 'pendente_analise' and not p_analise then raise exception 'Comissão em análise: use "Analisar e marcar como recebida"'; end if;
  perform definir_contexto_historico(case when p_analise then 'analise_manual' else 'manual' end);
  update comissoes
     set status = 'recebida', data_recebimento = hoje_sp(), liquidada_automaticamente = false,
         motivos_pendencia = case when p_analise then '{}' else motivos_pendencia end,
         aprovada_em = case when p_analise then now() else aprovada_em end,
         aprovada_por = case when p_analise then auth.uid() else aprovada_por end
   where id = p_id;
  perform definir_contexto_historico(null);
end $$;

-- G.6: reabertura individual → 'reaberta' (a linha não é apagada; não é re-liquidada pela rotina)
create or replace function reabrir_comissao(p_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  perform definir_contexto_historico('reabertura');
  update comissoes
     set status = 'reaberta', data_recebimento = null, liquidada_automaticamente = false, reaberta_em = now(), reaberta_por = auth.uid()
   where id = p_id and status = 'recebida';
  if not found then perform definir_contexto_historico(null); raise exception 'Só comissões recebidas podem ser reabertas'; end if;
  perform definir_contexto_historico(null);
end $$;

-- 'Definir comissão' / 'Editar comissão' (D.5): valor manual prevalece sobre recálculos; reavalia a completude.
create or replace function definir_comissao(p_id uuid, p_valor numeric)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare c comissoes%rowtype; v_total numeric;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if p_valor is null or p_valor < 0 or p_valor > 99999999 then raise exception 'Valor de comissão inválido'; end if;
  select * into c from comissoes where id = p_id for update;
  if not found then raise exception 'Comissão não encontrada'; end if;
  if c.status in ('recebida', 'cancelada') then raise exception 'Comissão recebida ou cancelada não pode ser alterada'; end if;
  select valor_total into v_total from pedidos where id = c.pedido_id;
  update comissoes set valor = round(p_valor, 2), origem_calculo = 'manual',
         percentual = case when coalesce(v_total, 0) > 0 then least(round(p_valor / v_total * 100, 2), 999.99) else 0 end
   where id = p_id;
  update pedidos set comissao_total = round(p_valor, 2) where id = c.pedido_id;
  update pedido_itens set origem_calculo = 'manual' where pedido_id = c.pedido_id;
  perform avaliar_comissao(p_id);
  perform liquidar_comissoes(array[c.pedido_id]);
end $$;

-- K: edição manual da data de recebimento (qualquer status). data <= hoje → recebida; data > hoje → prevista;
-- NULL ('Remover data') → pendente_analise (incompleta) ou prevista (completa). Não mexe em valor, %, origem,
-- completude, motivos, lote nem aprovação (K.6/K.7). Marca data_recebimento_editada (protegida da rotina — L.3).
create or replace function atualizar_data_recebimento(p_id uuid, p_data date)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare c comissoes%rowtype; v_status text;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if p_data is not null and (p_data < date '2000-01-01' or p_data > hoje_sp() + 3650) then raise exception 'Data de recebimento inválida'; end if;
  select * into c from comissoes where id = p_id for update;
  if not found then raise exception 'Comissão não encontrada'; end if;
  if c.status = 'cancelada' then raise exception 'Comissão cancelada não pode ser alterada'; end if;
  v_status := case when p_data is null then (case when c.completude = 'incompleta' then 'pendente_analise' else 'prevista' end)
                   when p_data <= hoje_sp() then 'recebida' else 'prevista' end;
  perform definir_contexto_historico('edicao_manual');
  update comissoes
     set data_recebimento = p_data, status = v_status, liquidada_automaticamente = false,
         data_recebimento_editada = true, editada_em = now(), editada_por = auth.uid()
   where id = p_id;
  perform definir_contexto_historico(null);
  return v_status;
end $$;

-- I: aprovação em lote. Transacional (falha = nada gravado), até 2.000, nunca altera valor nem limpa motivos.
-- data_recebimento = data da APROVAÇÃO (não a previsão). Recebida/reaberta/cancelada não são selecionáveis.
create or replace function aprovar_comissoes_lote(p_ids uuid[], p_filtro jsonb default '{}')
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_lote uuid := gen_random_uuid();
  v_n int;
  v_total numeric(12,2);
  v_motivos jsonb;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Selecione ao menos uma comissão'; end if;
  if cardinality(p_ids) > 2000 then raise exception 'Lote acima de 2.000 comissões: refine o filtro'; end if;
  if (select count(*) from comissoes where id = any (p_ids)) <> cardinality(array(select distinct unnest(p_ids))) then
    raise exception 'Há comissões inexistentes na seleção';
  end if;
  if exists (select 1 from comissoes where id = any (p_ids) and status in ('recebida', 'reaberta', 'cancelada')) then
    raise exception 'A seleção tem comissões recebidas, reabertas ou canceladas (não selecionáveis)';
  end if;
  select count(*), coalesce(sum(valor), 0) into v_n, v_total from comissoes where id = any (p_ids);
  select coalesce(jsonb_object_agg(m, n), '{}') into v_motivos
    from (select unnest(motivos_pendencia) m, count(*) n from comissoes where id = any (p_ids) group by 1) x;
  insert into comissoes_lotes (id, user_id, tipo, autor, quantidade, valor_total, filtro, motivos)
  values (v_lote, auth.uid(), 'aprovacao', auth.uid(), v_n, v_total, coalesce(p_filtro, '{}'), v_motivos);
  perform definir_contexto_historico('aprovacao_lote', v_lote);
  update comissoes
     set status = 'recebida', data_recebimento = hoje_sp(), liquidada_automaticamente = false,
         aprovada_em = now(), aprovada_por = auth.uid(), lote_aprovacao_id = v_lote
   where id = any (p_ids);
  perform definir_contexto_historico(null);
  return jsonb_build_object('lote_id', v_lote, 'quantidade', v_n, 'valor_total', v_total);
end $$;

-- J: reabrir lote → TODAS voltam a 'pendente_analise' (motivos intactos); não são re-liquidadas (reaberta_em).
-- O vínculo com o lote (lote_aprovacao_id) é mantido como histórico.
create or replace function reabrir_lote_comissoes(p_lote uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare v_n int; v_total numeric(12,2); v_ed int;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select count(*), coalesce(sum(valor), 0), count(*) filter (where data_recebimento_editada) into v_n, v_total, v_ed
    from comissoes where lote_aprovacao_id = p_lote and status = 'recebida' and aprovada_em is not null;
  if v_n = 0 then raise exception 'Lote sem comissões aprovadas para reabrir'; end if;
  insert into comissoes_lotes (user_id, tipo, lote_ref, autor, quantidade, valor_total)
  values (auth.uid(), 'reabertura', p_lote, auth.uid(), v_n, v_total);
  perform definir_contexto_historico('reabertura_lote', p_lote);
  update comissoes
     set status = 'pendente_analise', data_recebimento = null, aprovada_em = null, aprovada_por = null,
         liquidada_automaticamente = false, reaberta_em = now(), reaberta_por = auth.uid()
   where lote_aprovacao_id = p_lote and status = 'recebida' and aprovada_em is not null;
  perform definir_contexto_historico(null);
  return jsonb_build_object('quantidade', v_n, 'valor_total', v_total, 'datas_editadas', v_ed);
end $$;

-- 'atrasada' deixou de existir: o job diário vira no-op e é desligado
create or replace function public.marcar_comissoes_atrasadas() returns integer
language sql set search_path = public, pg_temp as $$ select 0 $$;
do $$ begin perform cron.unschedule('comissoes-atrasadas'); exception when others then null; end $$;

-- ---------- Funções de pedido adaptadas (status 'prevista', completude F, liquidação G) ----------
create or replace function confirmar_pedido(p_pedido_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ped pedidos%rowtype;
  v_rep numeric;
  v_total numeric(12,2);
  v_com numeric(12,2);
  v_cid uuid;
begin
  select * into v_ped from pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_ped.status <> 'rascunho' then raise exception 'Só pedidos em rascunho podem ser confirmados'; end if;
  select comissao_percentual into v_rep from representadas where id = v_ped.representada_id;

  -- precedência (Fase 19) para todos os itens; item sem produto usa a representada (D); planilha > 0 prevalece (Fase 20)
  update pedido_itens i
     set comissao_percentual = x.pct,
         origem_calculo = x.origem,
         comissao_valor = case when i.comissao_origem = 'planilha' then i.comissao_valor else round(i.subtotal * x.pct / 100, 2) end
    from (select i2.id, resolver_comissao_pct(p.comissao, v_rep) as pct, origem_comissao(p.comissao, v_rep) as origem
            from pedido_itens i2 left join produtos p on p.id = i2.produto_id
           where i2.pedido_id = p_pedido_id and coalesce(i2.origem_calculo, '') <> 'manual') x
   where x.id = i.id;

  select coalesce(sum(subtotal), 0), coalesce(sum(comissao_valor), 0) into v_total, v_com
    from pedido_itens where pedido_id = p_pedido_id;
  if v_total <= 0 then raise exception 'Pedido sem itens'; end if;

  update pedidos set status = 'confirmado', valor_total = v_total, comissao_total = v_com where id = p_pedido_id;

  insert into cliente_representada (cliente_id, representada_id)
  values (v_ped.cliente_id, v_ped.representada_id) on conflict do nothing;

  insert into comissoes (user_id, representada_id, pedido_id, percentual, valor, status)
  values (v_ped.user_id, v_ped.representada_id, p_pedido_id, round(v_com / v_total * 100, 2), v_com, 'prevista')
  returning id into v_cid;
  -- F: completude, motivos, previsão (E) e origem; G: importado completo com previsão anterior ao upload é liquidado
  perform avaliar_comissao(v_cid);
  if v_ped.origem = 'importacao' then perform liquidar_comissoes(array[p_pedido_id]); end if;

  if auth.uid() is not null then perform recalcular_alertas_pedido(p_pedido_id); end if;
end $$;

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
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_prod produtos%rowtype;
  v_rep_com numeric;
  v_antigos jsonb;
  v_avulsos jsonb;
  v_ant jsonb;
  v_item_id uuid;
  v_preco numeric(12,2);
  v_qtd numeric(12,3);
  v_desc numeric(5,2);
  v_acr numeric(5,2);
  v_pct numeric(5,2);
  v_ocalc text;
  v_sub numeric(12,2);
  v_val numeric(12,2);
  v_origem text;
  v_descr text;
  v_sku text;
  v_rotulo text;
  v_total numeric(12,2);
  v_com numeric(12,2);
  v_confirmado boolean;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
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

  -- % já gravado de cada item é mantido (nunca recalcular comissão de item gravado); valor da planilha também
  -- enquanto o subtotal não mudar
  select coalesce(jsonb_object_agg(produto_id::text, jsonb_build_object(
           'pct', comissao_percentual, 'valor', comissao_valor, 'sub', subtotal, 'origem', comissao_origem,
           'ausente', comissao_planilha_ausente, 'ocalc', origem_calculo)) filter (where produto_id is not null), '{}'::jsonb),
         coalesce(jsonb_object_agg(id::text, jsonb_build_object(
           'pct', comissao_percentual, 'valor', comissao_valor, 'sub', subtotal, 'origem', comissao_origem,
           'ausente', comissao_planilha_ausente, 'ocalc', origem_calculo, 'linha', linha_planilha)) filter (where produto_id is null), '{}'::jsonb)
    into v_antigos, v_avulsos
    from pedido_itens where pedido_id = p_pedido_id;
  delete from pedido_itens where pedido_id = p_pedido_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item->>'quantidade')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;
    v_desc := coalesce((v_item->>'desconto_percentual')::numeric, 0);
    v_acr := coalesce((v_item->>'acrescimo_percentual')::numeric, 0);

    if nullif(v_item->>'produto_id', '') is null then
      v_descr := nullif(btrim(v_item->>'descricao_informada'), '');
      v_sku := nullif(btrim(v_item->>'sku_informado'), '');
      if v_descr is null then raise exception 'Informe a descrição do item sem produto'; end if;
      if length(v_descr) > 200 then raise exception 'Descrição do item: máximo de 200 caracteres'; end if;
      if length(coalesce(v_sku, '')) > 60 then raise exception 'SKU do item: máximo de 60 caracteres'; end if;
      v_rotulo := v_descr;
      v_prod := null;
      v_ant := v_avulsos->(v_item->>'item_id');
    else
      select * into v_prod from produtos
       where id = (v_item->>'produto_id')::uuid and representada_id = v_ped.representada_id;
      if not found then raise exception 'Produto não pertence à representada'; end if;
      if not v_prod.ativo and not (v_antigos ? v_prod.id::text) then raise exception 'Produto inativo: %', v_prod.nome; end if;
      v_rotulo := v_prod.nome; v_descr := null; v_sku := null;
      v_ant := v_antigos->v_prod.id::text;
    end if;

    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida para %', v_rotulo; end if;
    if v_preco is null or v_preco < 0 then raise exception 'Preço inválido para %', v_rotulo; end if;
    if v_desc < 0 or v_desc > 100 then raise exception 'Desconto inválido para %', v_rotulo; end if;
    if v_acr < 0 or v_acr > 100 then raise exception 'Acréscimo inválido para %', v_rotulo; end if;

    v_pct := coalesce((v_ant->>'pct')::numeric, resolver_comissao_pct(v_prod.comissao, v_rep_com));
    v_ocalc := case when v_ant is not null then v_ant->>'ocalc' else origem_comissao(v_prod.comissao, v_rep_com) end;
    v_sub := round(v_qtd * v_preco * (1 + v_acr / 100) * (1 - v_desc / 100), 2);
    if v_ant->>'origem' = 'planilha' and (v_ant->>'sub')::numeric = v_sub then
      v_origem := 'planilha';
      v_val := (v_ant->>'valor')::numeric;
    else
      v_origem := 'calculada';
      v_val := case when v_confirmado then round(v_sub * v_pct / 100, 2) else 0 end;
    end if;

    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, acrescimo_percentual,
                              desconto_acima_max, subtotal, comissao_percentual, comissao_valor, comissao_origem, comissao_planilha_ausente,
                              origem_calculo, sku_informado, descricao_informada, linha_planilha)
    values (p_pedido_id, v_prod.id, coalesce(v_prod.nome, v_descr), v_qtd, v_preco, v_desc, v_acr,
            v_desc > resolver_desconto_max(v_ped.user_id, v_prod.id, v_ped.cliente_id, v_ped.representada_id), v_sub, v_pct,
            v_val, v_origem, coalesce((v_ant->>'ausente')::boolean, false), v_ocalc, v_sku, v_descr, (v_ant->>'linha')::int)
    returning id into v_item_id;
    if v_prod.id is null then
      perform registrar_pendencia_produto_nao_vinculado(p_pedido_id, v_item_id, jsonb_build_object('sku', v_sku, 'descricao', v_descr));
    end if;
  end loop;

  select coalesce(sum(subtotal), 0), coalesce(sum(comissao_valor), 0) into v_total, v_com
    from pedido_itens where pedido_id = p_pedido_id;
  if v_confirmado and v_total <= 0 then raise exception 'Pedido sem itens'; end if;

  update pedidos
     set valor_total = v_total,
         comissao_total = case when v_confirmado and not exists (select 1 from comissoes where pedido_id = p_pedido_id and origem_calculo = 'manual')
                               then v_com else comissao_total end,
         forma_pagamento = nullif(trim(p_forma_pagamento), ''),
         prazo_tipo = coalesce(p_prazo_tipo, 'a_vista'),
         prazo_dias = case when coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' then p_prazo_dias end,
         codigo_pedido = case when not v_ped.codigo_gerado and nullif(btrim(p_codigo), '') is not null
                              then btrim(p_codigo) else codigo_pedido end,
         data_faturamento = p_data_faturamento
   where id = p_pedido_id;

  if v_confirmado then
    -- comissão definida manualmente (D.5) não é sobrescrita pela edição
    update comissoes
       set valor = v_com, percentual = case when v_total > 0 then round(v_com / v_total * 100, 2) else 0 end
     where pedido_id = p_pedido_id and status <> 'cancelada' and coalesce(origem_calculo, '') <> 'manual';
    perform reavaliar_comissoes(p_pedido_id, null);
  end if;

  perform recalcular_alertas_pedido(p_pedido_id);
end $$;

create or replace function recalcular_comissao_item_vinculado(p_item_id uuid)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_item pedido_itens%rowtype;
  v_ped pedidos%rowtype;
  v_cat numeric;
  v_rep numeric;
  v_pct numeric;
  v_origem text;
  v_total numeric(12,2);
  v_com numeric(12,2);
begin
  select * into v_item from pedido_itens where id = p_item_id for update;
  if not found or v_item.produto_id is null then raise exception 'Item sem produto vinculado'; end if;
  select * into v_ped from pedidos where id = v_item.pedido_id;
  if v_ped.status = 'cancelado' or coalesce(v_item.origem_calculo, '') = 'manual'
     or exists (select 1 from comissoes where pedido_id = v_ped.id and (status = 'recebida' or origem_calculo = 'manual')) then
    return 'preservado';
  end if;
  select comissao into v_cat from produtos where id = v_item.produto_id;
  select comissao_percentual into v_rep from representadas where id = v_ped.representada_id;
  v_pct := resolver_comissao_pct(v_cat, v_rep);
  v_origem := origem_comissao(v_cat, v_rep);

  if v_ped.status = 'rascunho' then
    -- valor em R$ só nasce na emissão (confirmar_pedido)
    update pedido_itens set comissao_percentual = v_pct, origem_calculo = v_origem where id = p_item_id;
    return 'recalculado';
  end if;

  update pedido_itens
     set comissao_percentual = v_pct, origem_calculo = v_origem,
         comissao_valor = case when comissao_origem = 'planilha' then comissao_valor else round(subtotal * v_pct / 100, 2) end
   where id = p_item_id;
  select coalesce(sum(subtotal), 0), coalesce(sum(comissao_valor), 0) into v_total, v_com from pedido_itens where pedido_id = v_ped.id;
  update pedidos set comissao_total = v_com where id = v_ped.id;
  update comissoes
     set valor = v_com, percentual = case when v_total > 0 then round(v_com / v_total * 100, 2) else 0 end
   where pedido_id = v_ped.id and status not in ('recebida', 'cancelada') and coalesce(origem_calculo, '') <> 'manual';
  -- F.5: vincular o produto reavalia a completude (e G para importados)
  perform reavaliar_comissoes(v_ped.id, null);
  return 'recalculado';
end $$;

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
  v_prod_txt text;
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
        from pedido_itens i left join produtos p on p.id = i.produto_id
       where i.pedido_id = p_pedido_id
       order by i.desconto_percentual
    loop
      v_prod_txt := coalesce(r.produto_id::text, '');
      if v_manual then
        v_desc_max := resolver_desconto_max(v_ped.user_id, r.produto_id, v_ped.cliente_id, v_ped.representada_id);
        if r.desconto_percentual > v_desc_max then
          perform registrar_alerta_pedido(p_pedido_id, v_ped.user_id, r.id, r.produto_id, 'desconto_acima_limite',
            jsonb_build_object('produto_id', r.produto_id, 'desconto_aplicado', r.desconto_percentual, 'desconto_maximo', v_desc_max));
          v_chaves := v_chaves || (v_prod_txt || '|desconto_acima_limite');
        end if;
        if r.produto_id is not null then
          v_preco_cat := null;
          select tp.preco into v_preco_cat from tabelas_preco tp
           where tp.produto_id = r.produto_id and (tp.cliente_id = v_ped.cliente_id or tp.cliente_id is null)
           order by tp.cliente_id nulls last limit 1;
          v_preco_cat := coalesce(v_preco_cat, r.preco_prod);
          if coalesce(v_preco_cat, 0) > 0 and abs(r.preco_unitario - v_preco_cat) >= 0.005 then
            perform registrar_alerta_pedido(p_pedido_id, v_ped.user_id, r.id, r.produto_id, 'preco_divergente',
              jsonb_build_object('produto_id', r.produto_id, 'preco_praticado', r.preco_unitario, 'preco_catalogo', v_preco_cat));
            v_chaves := v_chaves || (v_prod_txt || '|preco_divergente');
          end if;
        end if;
      end if;

      if r.produto_id is null then continue; end if;
      -- Fase 21 (A.2): representada vazia + catálogo definido usa o catálogo SEM alerta
      if coalesce(v_rep_com, 0) <= 0 and coalesce(r.com_cat, 0) <= 0 and coalesce(r.comissao_percentual, 0) <= 0
            and r.comissao_origem <> 'planilha' then
        perform registrar_alerta_pedido(p_pedido_id, v_ped.user_id, r.id, r.produto_id, 'comissao_nao_definida',
          jsonb_build_object('produto_id', r.produto_id, 'representada_id', v_ped.representada_id, 'comissao_representada', v_rep_com,
                             'comissao_catalogo', r.com_cat, 'origem_escolhida', 'zero'));
        v_chaves := v_chaves || (v_prod_txt || '|comissao_nao_definida');
      end if;
    end loop;
  end if;

  update alertas_pedido set status = 'resolvido_auto', resolvido_em = now()
   where pedido_id = p_pedido_id and status = 'pendente'
     and (coalesce(produto_id::text, '') || '|' || tipo) <> all (v_chaves);
  get diagnostics v_resolvidos = row_count;
  return jsonb_build_object('ativos', cardinality(v_chaves), 'resolvidos', v_resolvidos);
end $$;

drop function avaliar_completude_comissao(uuid);

-- A.2: alerta removido do motor; os pendentes desse tipo são resolvidos
update alertas_pedido set status = 'resolvido_auto', resolvido_em = now()
 where tipo = 'comissao_catalogo_sem_representada' and status = 'pendente';

-- ---------- Legado (A.5 + reavaliação): completude das abertas e liquidação retroativa ÚNICA dos importados completos ----------
do $$
declare v uuid;
begin
  for v in select id from comissoes where status not in ('recebida', 'cancelada') loop
    perform avaliar_comissao(v);
  end loop;
  perform liquidar_comissoes(null);
end $$;

revoke execute on function definir_contexto_historico(text, uuid, boolean) from public, anon;
grant execute on function definir_contexto_historico(text, uuid, boolean) to authenticated;
revoke execute on function hoje_sp() from public, anon;
grant execute on function hoje_sp() to authenticated;
revoke execute on function calcular_previsao_recebimento(date, date, text, int, text, text, int) from public, anon;
grant execute on function calcular_previsao_recebimento(date, date, text, int, text, text, int) to authenticated;
revoke execute on function verificar_completude_comissao(uuid) from public, anon;
grant execute on function verificar_completude_comissao(uuid) to authenticated;
revoke execute on function avaliar_comissao(uuid) from public, anon;
grant execute on function avaliar_comissao(uuid) to authenticated;
revoke execute on function liquidar_comissoes(uuid[]) from public, anon;
grant execute on function liquidar_comissoes(uuid[]) to authenticated;
revoke execute on function reavaliar_comissoes(uuid, uuid) from public, anon;
grant execute on function reavaliar_comissoes(uuid, uuid) to authenticated;
revoke execute on function marcar_comissao_recebida(uuid, boolean) from public, anon;
grant execute on function marcar_comissao_recebida(uuid, boolean) to authenticated;
revoke execute on function reabrir_comissao(uuid) from public, anon;
grant execute on function reabrir_comissao(uuid) to authenticated;
revoke execute on function definir_comissao(uuid, numeric) from public, anon;
grant execute on function definir_comissao(uuid, numeric) to authenticated;
revoke execute on function atualizar_data_recebimento(uuid, date) from public, anon;
grant execute on function atualizar_data_recebimento(uuid, date) to authenticated;
revoke execute on function aprovar_comissoes_lote(uuid[], jsonb) from public, anon;
grant execute on function aprovar_comissoes_lote(uuid[], jsonb) to authenticated;
revoke execute on function reabrir_lote_comissoes(uuid) from public, anon;
grant execute on function reabrir_lote_comissoes(uuid) to authenticated;

-- ---------- Importação: coluna opcional "Data de Faturamento" (base da previsão E e da completude F.1b) ----------
-- A liquidação automática (G.7) roda no commit, dentro de confirmar_pedido (pedido importado completo).
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
  v_item_id uuid;
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
    v_pend := exists (select 1 from jsonb_array_elements(v_ped->'itens') i where nullif(i->>'produto_id', '') is null);
    insert into pedidos (user_id, representada_id, cliente_id, numero, codigo_pedido, codigo_gerado, data, status,
                         forma_pagamento, prazo_tipo, prazo_dias, origem, observacoes, tem_pendencias, data_faturamento)
    values (v_uid, (v_ped->>'representada_id')::uuid, (v_ped->>'cliente_id')::uuid, 'P' || lpad(v_n::text, 6, '0'),
            v_cod, v_cod is null, (v_ped->>'data')::date::timestamptz + interval '12 hours', 'rascunho',
            nullif(v_ped->>'forma_pagamento', ''), case when v_prazo is null then 'a_vista' else 'a_prazo' end, v_prazo,
            'importacao', nullif(left(btrim(v_ped->>'observacoes'), 500), ''), v_pend, nullif(v_ped->>'data_faturamento', '')::date)
    returning id into v_id;

    for v_item in select * from jsonb_array_elements(v_ped->'itens') loop
      v_qtd := (v_item->>'quantidade')::numeric;
      v_preco := (v_item->>'preco_unitario')::numeric;
      v_desc := coalesce((v_item->>'desconto_percentual')::numeric, 0);
      v_acr := coalesce((v_item->>'acrescimo_percentual')::numeric, 0);
      v_com := nullif((v_item->>'comissao_valor')::numeric, 0);  -- zero = ausência (nunca aceito)
      if v_com is not null and v_com < 0 then raise exception 'Comissão negativa no lote'; end if;
      insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, acrescimo_percentual,
                                subtotal, comissao_percentual, comissao_valor, comissao_origem, comissao_planilha_ausente,
                                sku_informado, descricao_informada, linha_planilha)
      values (v_id, nullif(v_item->>'produto_id', '')::uuid, nullif(left(btrim(v_item->>'descricao'), 200), ''), v_qtd, v_preco, v_desc, v_acr,
              round(v_qtd * v_preco * (1 + v_acr / 100) * (1 - v_desc / 100), 2), null, v_com,
              case when v_com is not null then 'planilha' else 'calculada' end,
              v_com is null and coalesce((v_item->>'comissao_ausente')::boolean, false),
              nullif(left(btrim(v_item->>'sku'), 60), ''), nullif(left(btrim(v_item->>'descricao'), 200), ''), (v_item->>'linha')::int)
      returning id, produto_id is null into v_item_id, v_pend;
      if v_pend then
        perform registrar_pendencia_produto_nao_vinculado(v_id, v_item_id,
          jsonb_build_object('sku', v_item->>'sku', 'descricao', v_item->>'descricao', 'linha', v_item->>'linha'));
      end if;
      v_itens := v_itens + 1;
    end loop;

    update pedidos set valor_total = (select coalesce(sum(subtotal), 0) from pedido_itens where pedido_id = v_id) where id = v_id;
    -- Fase 17 (inalterado): pedido com produto pendente fica em rascunho
    if not (select tem_pendencias from pedidos where id = v_id) and (select valor_total from pedidos where id = v_id) > 0 then
      perform confirmar_pedido(v_id);
    else
      perform recalcular_alertas_pedido(v_id);
    end if;
    v_ins := v_ins + 1;
  end loop;
  return jsonb_build_object('inseridas', v_ins, 'atualizadas', 0, 'itens', v_itens);
end $$;
