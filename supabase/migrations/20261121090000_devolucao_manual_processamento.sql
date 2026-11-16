-- Devolução manual (Clientes › Devoluções): Data de Processamento e estorno de comissão.
-- Pedido do usuário: Forma de Pagamento só "Geração de Crédito" ou "Outros"; remover Prazo de Pagamento e Prazo (dias);
-- novo campo Data de Processamento, que define quando a comissão NEGATIVA é lançada em Comissões.
-- Regras (mesmas da Fase 22): o estorno é registro separado em comissoes (tipo 'estorno'); a comissão original
-- nunca muda. Sem Data de Processamento → estorno 'prevista' (previsão = data da devolução); com data → 'recebida'
-- nessa data (mês do estorno). Devolução recusada → estorno cancelado. Excluir a devolução exclui o estorno dela.
-- Percentual: com pedido de origem, o JÁ GRAVADO no item do pedido (mesmo produto); sem pedido (avulsa), a
-- precedência atual (representada > catálogo). Estorno nunca passa da comissão do pedido ainda não estornada.
-- Dados existentes: a única devolução manual tinha forma 'bonificacao' → 'outros'; prazo removido. Nenhum estorno
-- é criado retroativamente (nasce ao salvar a devolução).

update devolucoes set forma_pagamento = 'outros' where forma_pagamento is not null and forma_pagamento not in ('geracao_credito', 'outros');
alter table devolucoes drop constraint devolucoes_forma_pagamento_check;
alter table devolucoes add constraint devolucoes_forma_pagamento_check check (forma_pagamento is null or forma_pagamento in ('geracao_credito', 'outros'));
alter table devolucoes drop column prazo_tipo, drop column prazo_dias;

drop function if exists salvar_devolucao(uuid, uuid, uuid, uuid, date, text, text, text, text, int, text, jsonb);

-- estorno da devolução manual (cria ou atualiza; idempotente). Único caminho que altera o estorno de devolução manual.
create or replace function sincronizar_estorno_devolucao(p_devolucao_id uuid)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  d devolucoes%rowtype;
  v_rep numeric;
  v_valor numeric(12,2) := 0;
  v_pct numeric;
  v_origem text;
  v_saldo numeric;
  v_status text;
  v_cid uuid;
  r record;
begin
  select * into d from devolucoes where id = p_devolucao_id for update;
  if not found then raise exception 'Devolução não encontrada'; end if;
  select comissao_percentual into v_rep from representadas where id = d.representada_id;

  for r in select di.produto_id, di.subtotal, p.comissao as com_cat from devolucao_itens di join produtos p on p.id = di.produto_id where di.devolucao_id = d.id loop
    if d.pedido_id is not null then
      -- percentual efetivo gravado nos itens do pedido para o produto (valor ÷ subtotal)
      select case when sum(i.subtotal) > 0 then sum(i.comissao_valor) / sum(i.subtotal) * 100 else 0 end, min(i.origem_calculo)
        into v_pct, v_origem from pedido_itens i where i.pedido_id = d.pedido_id and i.produto_id = r.produto_id;
    else
      v_pct := resolver_comissao_pct(r.com_cat, v_rep);
      v_origem := origem_comissao(r.com_cat, v_rep);
    end if;
    v_valor := v_valor + round(r.subtotal * coalesce(v_pct, 0) / 100, 2);
  end loop;

  if d.pedido_id is not null then
    select greatest(coalesce((select valor from comissoes where pedido_id = d.pedido_id and tipo = 'normal' and status <> 'cancelada'), 0)
                    + coalesce((select sum(valor) from comissoes where pedido_id = d.pedido_id and tipo = 'estorno' and status <> 'cancelada'
                                  and coalesce(devolucao_id, '00000000-0000-0000-0000-000000000000'::uuid) <> d.id), 0), 0)
      into v_saldo;
    v_valor := least(v_valor, v_saldo);
  end if;
  v_pct := case when d.valor_total > 0 then least(round(v_valor / d.valor_total * 100, 2), 999.99) else 0 end;
  v_status := case when d.status = 'recusada' then 'cancelada' when d.data_processamento is null then 'prevista' else 'recebida' end;

  update devolucoes set comissao_estornada = v_valor, percentual_aplicado = v_pct, origem_calculo = v_origem,
         processada_em = case when d.data_processamento is null then null else coalesce(processada_em, now()) end,
         processada_por = case when d.data_processamento is null then null else coalesce(processada_por, auth.uid()) end
   where id = d.id;

  perform set_config('plurima.estorno_ok', '1', true);
  perform definir_contexto_historico('devolucao_manual');
  select id into v_cid from comissoes where devolucao_id = d.id;
  if v_cid is null then
    insert into comissoes (user_id, representada_id, pedido_id, devolucao_id, tipo, percentual, valor, status,
                           data_prevista_recebimento, data_recebimento, completude, origem_calculo)
    values (d.user_id, d.representada_id, d.pedido_id, d.id, 'estorno', v_pct, -v_valor, v_status,
            coalesce(d.data_processamento, d.data), d.data_processamento, 'completa', v_origem)
    returning id into v_cid;
    update devolucoes set comissao_id = v_cid where id = d.id;
  else
    update comissoes set representada_id = d.representada_id, pedido_id = d.pedido_id, percentual = v_pct, valor = -v_valor,
           status = v_status, data_prevista_recebimento = coalesce(d.data_processamento, d.data), data_recebimento = d.data_processamento,
           origem_calculo = v_origem, liquidada_automaticamente = false
     where id = v_cid;
  end if;
  perform set_config('plurima.estorno_ok', '', true);
  perform definir_contexto_historico(null);
  return v_cid;
end $$;

create function salvar_devolucao(
  p_id uuid, p_cliente_id uuid, p_representada_id uuid, p_pedido_id uuid, p_data date,
  p_motivo text, p_status text, p_forma_pagamento text, p_data_processamento date, p_observacoes text, p_itens jsonb
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := p_id;
  v_item jsonb;
  v_prod produtos%rowtype;
  v_qtd numeric(12,3);
  v_preco numeric(12,2);
  v_desc numeric(5,2);
  v_vendida numeric;
  v_ja numeric;
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if not exists (select 1 from clientes where id = p_cliente_id) then raise exception 'Cliente não encontrado'; end if;
  if not exists (select 1 from representadas where id = p_representada_id) then raise exception 'Representada não encontrada'; end if;
  if p_data is null then raise exception 'Informe a data da devolução'; end if;
  if p_data_processamento is not null and p_data_processamento < p_data then
    raise exception 'A Data de Processamento não pode ser anterior à data da devolução';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item';
  end if;
  if p_pedido_id is not null and not exists (
    select 1 from pedidos where id = p_pedido_id and cliente_id = p_cliente_id and representada_id = p_representada_id
  ) then
    raise exception 'Pedido de origem não pertence a este cliente e representada';
  end if;

  if v_id is null then
    insert into devolucoes (user_id, numero, cliente_id, representada_id, pedido_id, data, motivo, status,
                            forma_pagamento, data_processamento, observacoes)
    values (
      v_uid,
      'DV' || lpad((coalesce((select max(substring(numero from 3)::int) from devolucoes where user_id = v_uid and numero ~ '^DV[0-9]+$'), 0) + 1)::text, 6, '0'),
      p_cliente_id, p_representada_id, p_pedido_id, p_data, p_motivo, coalesce(p_status, 'pendente'),
      nullif(trim(p_forma_pagamento), ''), p_data_processamento, nullif(trim(p_observacoes), '')
    ) returning id into v_id;
  else
    update devolucoes set
      cliente_id = p_cliente_id, representada_id = p_representada_id, pedido_id = p_pedido_id, data = p_data,
      motivo = p_motivo, status = coalesce(p_status, 'pendente'), forma_pagamento = nullif(trim(p_forma_pagamento), ''),
      data_processamento = p_data_processamento, observacoes = nullif(trim(p_observacoes), '')
    where id = v_id and chave_unica is null;
    if not found then raise exception 'Devolução não encontrada (devoluções importadas são processadas em Comissões › Devoluções)'; end if;
    delete from devolucao_itens where devolucao_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_prod from produtos
     where id = (v_item->>'produto_id')::uuid and representada_id = p_representada_id;
    if not found then raise exception 'Produto não pertence à representada'; end if;

    v_qtd := (v_item->>'quantidade')::numeric;
    v_preco := (v_item->>'preco_unitario')::numeric;
    v_desc := coalesce((v_item->>'desconto_percentual')::numeric, 0);
    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida para %', v_prod.nome; end if;
    if v_preco is null or v_preco < 0 then raise exception 'Preço inválido para %', v_prod.nome; end if;
    if v_desc < 0 or v_desc > 100 then raise exception 'Desconto inválido para %', v_prod.nome; end if;

    if p_pedido_id is not null then
      select sum(quantidade) into v_vendida from pedido_itens where pedido_id = p_pedido_id and produto_id = v_prod.id;
      if v_vendida is null then raise exception 'O produto % não está no pedido de origem', v_prod.nome; end if;
      select coalesce(sum(di.quantidade), 0) into v_ja
        from devolucao_itens di join devolucoes d on d.id = di.devolucao_id
       where d.pedido_id = p_pedido_id and d.id <> v_id and d.status <> 'recusada' and di.produto_id = v_prod.id;
      if v_ja + v_qtd + coalesce((select sum(quantidade) from devolucao_itens where devolucao_id = v_id and produto_id = v_prod.id), 0) > v_vendida then
        raise exception 'Quantidade devolvida de % (%) excede a do pedido de origem (% vendida, % já devolvida)',
          v_prod.nome, v_qtd, v_vendida, v_ja;
      end if;
    end if;

    insert into devolucao_itens (devolucao_id, produto_id, quantidade, preco_unitario, desconto_percentual, subtotal)
    values (v_id, v_prod.id, v_qtd, v_preco, v_desc, round(v_qtd * v_preco * (1 - v_desc / 100), 2));
  end loop;

  update devolucoes set valor_total = (select coalesce(sum(subtotal), 0) from devolucao_itens where devolucao_id = v_id) where id = v_id;
  -- comissão negativa (estorno) lançada em Comissões pela Data de Processamento
  perform sincronizar_estorno_devolucao(v_id);
  return v_id;
end $$;

-- excluir a devolução exclui o estorno dela (AFTER: a FK comissoes.devolucao_id já foi anulada; o histórico sai em cascata)
create or replace function devolucoes_excluir_estorno() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.comissao_id is not null then delete from comissoes where id = old.comissao_id and tipo = 'estorno'; end if;
  return null;
end $$;
create trigger devolucoes_excluir_estorno after delete on devolucoes for each row execute function devolucoes_excluir_estorno();

revoke execute on function sincronizar_estorno_devolucao(uuid) from public, anon;
grant execute on function sincronizar_estorno_devolucao(uuid) to authenticated;
revoke execute on function salvar_devolucao(uuid, uuid, uuid, uuid, date, text, text, text, date, text, jsonb) from public, anon;
grant execute on function salvar_devolucao(uuid, uuid, uuid, uuid, date, text, text, text, date, text, jsonb) to authenticated;
