-- FASE 22 — Cadastro de devoluções por Excel, comissão negativa (estorno) e processamento.
-- Decisões do usuário (item A):
--  Tabela: a tabela 'devolucoes' JÁ EXISTE (módulo manual, cabeçalho + devolucao_itens): ESTENDIDA, sem tabela
--      paralela. Cada linha da planilha vira uma devolução de 1 item (sem devolucao_itens, então não entra nas
--      análises de vendas). "Data da Devolução" = coluna existente devolucoes.data (mapeada, sem duplicar).
--      O módulo manual continua igual e NÃO gera estorno; o registro manual existente fica intacto.
--  A.1 o cadastro cria o estorno 'prevista'; SÓ o processamento o move para 'recebida' (subtrai do recebido).
--  A.2 o mês do estorno = Data de Processamento (data_recebimento); antes de processar, previsão = Data da Devolução.
--  A.3 percentual e origem = os JÁ GRAVADOS no item original (item com valor da planilha: percentual efetivo
--      valor ÷ subtotal). Nunca o cadastro atual.
--  A.4 código do pedido não encontrado = linha inválida (validação da importação).
--  A.5 comissoes.valor não tinha CHECK: aceita negativo. Novo CHECK: só o estorno pode ser negativo.
--  A.6 estorno 'prevista' no cadastro e 'recebida' (data_recebimento = Data de Processamento) após processar.

-- ---------- B.1: devolucoes estendida ----------
alter table devolucoes
  add column pedido_item_id uuid references pedido_itens(id) on delete set null,
  add column produto_id uuid references produtos(id) on delete set null,
  add column codigo_pedido_informado text constraint devolucoes_codigo_informado_check check (codigo_pedido_informado is null or length(codigo_pedido_informado) <= 40),
  add column sku_informado text constraint devolucoes_sku_informado_check check (sku_informado is null or length(sku_informado) <= 60),
  add column descricao_informada text constraint devolucoes_descricao_informada_check check (descricao_informada is null or length(descricao_informada) <= 200),
  add column quantidade numeric(12,3) constraint devolucoes_quantidade_check check (quantidade is null or quantidade > 0),
  add column valor_unitario numeric(12,2),
  add column comissao_estornada numeric(12,2) not null default 0 constraint devolucoes_comissao_estornada_check check (comissao_estornada >= 0),
  add column percentual_aplicado numeric(9,4),
  add column origem_calculo text constraint devolucoes_origem_calculo_check check (origem_calculo in ('representada', 'catalogo', 'manual', 'zero')),
  add column data_processamento date,
  add column comissao_id uuid references comissoes(id) on delete set null,
  add column chave_unica text,
  add column importacao_id uuid,
  add column processada_em timestamptz,
  add column processada_por uuid;
alter table devolucoes add constraint devolucoes_importada_valor_check check (chave_unica is null or valor_total > 0);
alter table devolucoes drop constraint devolucoes_status_check;
alter table devolucoes add constraint devolucoes_status_check check (status in ('pendente', 'aprovada', 'recusada', 'concluida', 'processada'));
alter table devolucoes drop constraint devolucoes_motivo_check;
alter table devolucoes add constraint devolucoes_motivo_check
  check (motivo in ('produto_avariado', 'produto_incorreto', 'desistencia', 'prazo_entrega', 'outro', 'defeito', 'erro_pedido'));

-- B.2 índices
create index if not exists devolucoes_user_status_idx on devolucoes (user_id, status);
create index if not exists devolucoes_user_data_idx on devolucoes (user_id, data);
create index if not exists devolucoes_user_processamento_idx on devolucoes (user_id, data_processamento);
create index if not exists devolucoes_item_idx on devolucoes (pedido_item_id);
create index if not exists devolucoes_comissao_idx on devolucoes (comissao_id);
create unique index devolucoes_user_chave_key on devolucoes (user_id, chave_unica) where chave_unica is not null;

-- ---------- B.3: comissoes — estorno (valor negativo, tipo, vínculos) ----------
alter table comissoes
  add column tipo text not null default 'normal' constraint comissoes_tipo_check check (tipo in ('normal', 'estorno')),
  add column devolucao_id uuid references devolucoes(id) on delete set null,
  add column pedido_item_id uuid references pedido_itens(id) on delete set null;
alter table comissoes add constraint comissoes_valor_sinal_check check (tipo = 'estorno' or valor >= 0);
-- uma comissão NORMAL por pedido (o estorno também aponta para o pedido)
drop index if exists comissoes_pedido_key;
create unique index comissoes_pedido_key on comissoes (pedido_id) where pedido_id is not null and tipo = 'normal';
create unique index comissoes_devolucao_key on comissoes (devolucao_id) where devolucao_id is not null;
create index if not exists comissoes_user_tipo_idx on comissoes (user_id, tipo);

-- O estorno só muda pelo processamento/reabertura da devolução (ou cancelamento do pedido). Rotinas e recálculos
-- da Fase 21 (completude, liquidação, edição do pedido, aprovação em lote) passam por ele sem alterá-lo.
create or replace function comissoes_guarda_estorno()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.tipo = 'estorno' and coalesce(current_setting('plurima.estorno_ok', true), '') <> '1' and new.status is distinct from 'cancelada' then
    return old;
  end if;
  return new;
end $$;
create trigger comissoes_guarda_estorno before update on comissoes for each row execute function comissoes_guarda_estorno();

-- E.5: criação do estorno também vai para o histórico (alterações já vão pelo gatilho da Fase 21)
create or replace function comissoes_historico_criacao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.tipo = 'estorno' then
    insert into comissoes_historico (user_id, comissao_id, campo, valor_anterior, valor_novo, autor, motivo)
    values (new.user_id, new.id, 'status', null, new.status, auth.uid(), 'estorno_criado');
    if new.data_recebimento is not null then
      insert into comissoes_historico (user_id, comissao_id, campo, valor_anterior, valor_novo, autor, motivo)
      values (new.user_id, new.id, 'data_recebimento', null, new.data_recebimento::text, auth.uid(), 'estorno_criado');
    end if;
  end if;
  return null;
end $$;
revoke execute on function comissoes_historico_criacao() from public, anon, authenticated;
create trigger comissoes_historico_criacao after insert on comissoes for each row execute function comissoes_historico_criacao();

alter table importacoes drop constraint importacoes_tipo_check;
alter table importacoes add constraint importacoes_tipo_check check (tipo in ('produtos', 'representadas', 'clientes', 'pedidos', 'devolucoes'));

-- ---------- D/E/F: gravação do lote importado (transacional) ----------
-- Cada linha: devolução (1 item) + UMA comissão negativa. Dedup pela chave única (reenvio = duplicada, nada muda).
-- Revalida no banco (concorrência): quantidade devolvida ≤ vendida (erro) e estorno ≤ saldo da comissão do item
-- (limitado). A comissão ORIGINAL nunca é alterada.
create or replace function importar_devolucoes(p_linhas jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v jsonb;
  v_item record;
  v_ja numeric;
  v_est numeric;
  v_qtd numeric(12,3);
  v_com numeric(12,2);
  v_dp date;
  v_dd date;
  v_dev uuid;
  v_cid uuid;
  v_seq int;
  v_ins int := 0;
  v_dup int := 0;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then raise exception 'Lote inválido'; end if;
  if jsonb_array_length(p_linhas) > 5000 then raise exception 'Lote acima de 5.000 linhas'; end if;
  perform pg_advisory_xact_lock(hashtextextended('devolucoes:' || v_uid::text, 0));
  select coalesce(max(substring(numero from 3)::int), 0) into v_seq from devolucoes where user_id = v_uid and numero ~ '^DV[0-9]+$';

  for v in select * from jsonb_array_elements(p_linhas) loop
    select i.id, i.pedido_id, i.produto_id, i.quantidade, i.comissao_valor, p.cliente_id, p.representada_id
      into v_item
      from pedido_itens i join pedidos p on p.id = i.pedido_id
     where i.id = (v->>'pedido_item_id')::uuid;
    if not found then raise exception 'Item do pedido não encontrado (linha %)', v->>'linha'; end if;
    if exists (select 1 from devolucoes where user_id = v_uid and chave_unica = v->>'chave_unica') then
      v_dup := v_dup + 1;
      continue;
    end if;
    v_qtd := (v->>'quantidade')::numeric;
    v_dd := (v->>'data_devolucao')::date;
    v_dp := nullif(v->>'data_processamento', '')::date;
    select coalesce(sum(quantidade), 0), coalesce(sum(comissao_estornada), 0) into v_ja, v_est
      from devolucoes where pedido_item_id = v_item.id and chave_unica is not null;
    if v_ja + v_qtd > v_item.quantidade then
      raise exception 'Quantidade devolvida (%) excede a vendida (%) para este item.', v_ja + v_qtd, v_item.quantidade;
    end if;
    v_com := least(abs(coalesce((v->>'comissao_estornada')::numeric, 0)), greatest(coalesce(v_item.comissao_valor, 0) - v_est, 0));
    v_seq := v_seq + 1;

    insert into devolucoes (user_id, numero, cliente_id, representada_id, pedido_id, pedido_item_id, produto_id, data, motivo, status,
                            observacoes, valor_total, codigo_pedido_informado, sku_informado, descricao_informada, quantidade, valor_unitario,
                            comissao_estornada, percentual_aplicado, origem_calculo, data_processamento, chave_unica, processada_em, processada_por)
    values (v_uid, 'DV' || lpad(v_seq::text, 6, '0'), v_item.cliente_id, v_item.representada_id, v_item.pedido_id, v_item.id, v_item.produto_id,
            v_dd, coalesce(nullif(v->>'motivo', ''), 'outro'), case when v_dp is null then 'pendente' else 'processada' end,
            nullif(left(btrim(v->>'observacoes'), 500), ''), (v->>'valor_total')::numeric,
            nullif(left(btrim(v->>'codigo'), 40), ''), nullif(left(btrim(v->>'sku'), 60), ''), nullif(left(btrim(v->>'descricao'), 200), ''),
            v_qtd, nullif(v->>'valor_unitario', '')::numeric, v_com, nullif(v->>'percentual', '')::numeric, nullif(v->>'origem_calculo', ''),
            v_dp, v->>'chave_unica', case when v_dp is null then null else now() end, case when v_dp is null then null else v_uid end)
    returning id into v_dev;

    insert into comissoes (user_id, representada_id, pedido_id, pedido_item_id, devolucao_id, tipo, percentual, valor, status,
                           data_prevista_recebimento, data_recebimento, completude, origem_calculo, observacoes)
    values (v_uid, v_item.representada_id, v_item.pedido_id, v_item.id, v_dev, 'estorno',
            least(coalesce(nullif(v->>'percentual', '')::numeric, 0), 999.99), -v_com,
            case when v_dp is null then 'prevista' else 'recebida' end, coalesce(v_dp, v_dd), v_dp, 'completa', nullif(v->>'origem_calculo', ''),
            nullif(left(v->>'observacao_estorno', 500), ''))
    returning id into v_cid;
    update devolucoes set comissao_id = v_cid where id = v_dev;
    v_ins := v_ins + 1;
  end loop;
  return jsonb_build_object('inseridas', v_ins, 'atualizadas', 0, 'duplicadas', v_dup);
end $$;

-- ---------- G: marcar como processada (individual ou lote; transacional) ----------
create or replace function processar_devolucoes(p_ids uuid[], p_data date default null)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  d record;
  v_data date;
  v_n int := 0;
  v_total numeric(12,2) := 0;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Selecione ao menos uma devolução'; end if;
  if cardinality(p_ids) > 2000 then raise exception 'Lote acima de 2.000 devoluções: refine o filtro'; end if;
  if p_data is not null and (p_data < date '2000-01-01' or p_data > hoje_sp() + 3650) then raise exception 'Data de Processamento inválida'; end if;
  if (select count(*) from devolucoes where id = any (p_ids)) <> cardinality(array(select distinct unnest(p_ids))) then
    raise exception 'Há devoluções inexistentes na seleção';
  end if;
  if exists (select 1 from devolucoes where id = any (p_ids) and comissao_id is null) then raise exception 'Há devoluções sem estorno de comissão na seleção'; end if;
  if exists (select 1 from devolucoes where id = any (p_ids) and status <> 'pendente') then raise exception 'Há devoluções já processadas na seleção'; end if;
  perform set_config('plurima.estorno_ok', '1', true);
  perform definir_contexto_historico('processamento_devolucao');
  for d in select * from devolucoes where id = any (p_ids) for update loop
    v_data := coalesce(p_data, d.data_processamento);
    if v_data is null then raise exception 'Informe a Data de Processamento (devolução %)', d.numero; end if;
    update devolucoes set status = 'processada', data_processamento = v_data, processada_em = now(), processada_por = auth.uid() where id = d.id;
    update comissoes set status = 'recebida', data_recebimento = v_data, data_prevista_recebimento = v_data, liquidada_automaticamente = false
     where id = d.comissao_id;
    v_n := v_n + 1;
    v_total := v_total + d.comissao_estornada;
  end loop;
  perform set_config('plurima.estorno_ok', '', true);
  perform definir_contexto_historico(null);
  return jsonb_build_object('quantidade', v_n, 'valor_estornado', v_total);
end $$;

-- G.5: reabrir devolução → pendente; o estorno volta a 'prevista' (NUNCA é apagado)
create or replace function reabrir_devolucao(p_id uuid, p_limpar_data boolean default true)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare d devolucoes%rowtype;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select * into d from devolucoes where id = p_id for update;
  if not found then raise exception 'Devolução não encontrada'; end if;
  if d.status <> 'processada' or d.comissao_id is null then raise exception 'Só devoluções processadas com estorno podem ser reabertas'; end if;
  update devolucoes set status = 'pendente', processada_em = null, processada_por = null,
         data_processamento = case when p_limpar_data then null else data_processamento end
   where id = p_id;
  perform set_config('plurima.estorno_ok', '1', true);
  perform definir_contexto_historico('reabertura_devolucao');
  update comissoes set status = 'prevista', data_recebimento = null,
         data_prevista_recebimento = case when p_limpar_data then d.data else coalesce(d.data_processamento, d.data) end
   where id = d.comissao_id;
  perform set_config('plurima.estorno_ok', '', true);
  perform definir_contexto_historico(null);
end $$;

revoke execute on function importar_devolucoes(jsonb) from public, anon;
grant execute on function importar_devolucoes(jsonb) to authenticated;
revoke execute on function processar_devolucoes(uuid[], date) from public, anon;
grant execute on function processar_devolucoes(uuid[], date) to authenticated;
revoke execute on function reabrir_devolucao(uuid, boolean) from public, anon;
grant execute on function reabrir_devolucao(uuid, boolean) to authenticated;
