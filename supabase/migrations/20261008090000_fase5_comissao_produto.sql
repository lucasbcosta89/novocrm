-- FASE 5: pedidos + comissão por produto
alter table produtos add column comissao numeric(5,2) not null default 0
  constraint produtos_comissao_check check (comissao between 0 and 100);
update produtos p set comissao = r.comissao_padrao from representadas r where r.id = p.representada_id;

alter table pedido_itens
  add column comissao_percentual numeric(5,2) not null default 0,
  add column comissao_valor numeric(12,2) not null default 0;
create index pedido_itens_pedido_idx on pedido_itens (pedido_id);

alter table pedidos add constraint pedidos_status_check check (status in ('rascunho','confirmado','entregue','cancelado'));
alter table pedidos alter column status set default 'rascunho';
create unique index pedidos_user_numero_key on pedidos (user_id, numero);

alter table comissoes add column recebida_em timestamptz;
alter table comissoes add constraint comissoes_status_check check (status in ('a_receber','recebida','atrasada','cancelada'));
create unique index comissoes_pedido_key on comissoes (pedido_id) where pedido_id is not null;
create index comissoes_user_status_idx on comissoes (user_id, status, data_prevista);

-- Confirma rascunho: snapshot da comissão de cada produto nos itens + 1 linha em comissoes.
create or replace function public.confirmar_pedido(p_pedido_id uuid) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_ped pedidos%rowtype;
  v_total numeric(12,2);
  v_com numeric(12,2);
begin
  select * into v_ped from pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_ped.status <> 'rascunho' then raise exception 'Só pedidos em rascunho podem ser confirmados'; end if;

  update pedido_itens i
     set comissao_percentual = p.comissao,
         comissao_valor = round(i.subtotal * p.comissao / 100, 2)
    from produtos p
   where p.id = i.produto_id and i.pedido_id = p_pedido_id;

  select coalesce(sum(subtotal), 0), coalesce(sum(comissao_valor), 0) into v_total, v_com
    from pedido_itens where pedido_id = p_pedido_id;
  if v_total <= 0 then raise exception 'Pedido sem itens'; end if;

  update pedidos set status = 'confirmado', valor_total = v_total, comissao_total = v_com where id = p_pedido_id;

  insert into cliente_representada (cliente_id, representada_id)
  values (v_ped.cliente_id, v_ped.representada_id) on conflict do nothing;

  -- percentual = média ponderada (informativa); valor = soma real dos itens; vence no fim do mês do pedido.
  insert into comissoes (user_id, representada_id, pedido_id, percentual, valor, status, data_prevista)
  values (
    v_ped.user_id, v_ped.representada_id, p_pedido_id,
    round(v_com / v_total * 100, 2), v_com, 'a_receber',
    (date_trunc('month', v_ped.data at time zone 'America/Sao_Paulo') + interval '1 month' - interval '1 second')
      at time zone 'America/Sao_Paulo'
  );
end $$;

-- Cria pedido atômico. Preço: tabela do cliente > tabela padrão > produtos.preco.
-- Itens: [{produto_id, quantidade, desconto?}]
create or replace function public.criar_pedido(
  p_representada_id uuid, p_cliente_id uuid, p_itens jsonb,
  p_forma_pagamento text default null, p_confirmar boolean default false
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
  v_desc numeric(12,2);
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if not exists (select 1 from representadas where id = p_representada_id) then raise exception 'Representada não encontrada'; end if;
  if not exists (select 1 from clientes where id = p_cliente_id) then raise exception 'Cliente não encontrado'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item';
  end if;

  insert into pedidos (user_id, representada_id, cliente_id, numero, status, forma_pagamento, origem)
  values (
    v_uid, p_representada_id, p_cliente_id,
    'P' || lpad(((select count(*) from pedidos where user_id = v_uid) + 1)::text, 6, '0'),
    'rascunho', nullif(trim(p_forma_pagamento), ''), 'app'
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

    v_desc := coalesce((v_item->>'desconto')::numeric, 0);
    if v_desc < 0 or v_desc > round(v_qtd * v_preco * coalesce(v_desc_max, 0) / 100, 2) then
      raise exception 'Desconto acima do máximo permitido para %', v_prod.nome;
    end if;

    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto, subtotal, comissao_percentual)
    values (v_id, v_prod.id, v_prod.nome, v_qtd, v_preco, v_desc, round(v_qtd * v_preco - v_desc, 2), v_prod.comissao);
  end loop;

  update pedidos set valor_total = (select sum(subtotal) from pedido_itens where pedido_id = v_id) where id = v_id;

  if p_confirmar then perform confirmar_pedido(v_id); end if;
  return v_id;
end $$;

create or replace function public.cancelar_pedido(p_pedido_id uuid) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if exists (select 1 from comissoes where pedido_id = p_pedido_id and status = 'recebida') then
    raise exception 'Comissão já recebida: pedido não pode ser cancelado';
  end if;
  update pedidos set status = 'cancelado' where id = p_pedido_id and status <> 'cancelado';
  if not found then raise exception 'Pedido não encontrado ou já cancelado'; end if;
  update comissoes set status = 'cancelada' where pedido_id = p_pedido_id;
end $$;

-- Job diário: a_receber vencida → atrasada.
create or replace function public.marcar_comissoes_atrasadas() returns integer
language sql security definer set search_path = public, pg_temp as $$
  with t as (
    update comissoes set status = 'atrasada'
     where status = 'a_receber' and data_prevista < now()
    returning 1
  ) select count(*)::int from t;
$$;

revoke execute on function public.criar_pedido(uuid, uuid, jsonb, text, boolean) from public, anon;
revoke execute on function public.confirmar_pedido(uuid) from public, anon;
revoke execute on function public.cancelar_pedido(uuid) from public, anon;
grant execute on function public.criar_pedido(uuid, uuid, jsonb, text, boolean) to authenticated;
grant execute on function public.confirmar_pedido(uuid) to authenticated;
grant execute on function public.cancelar_pedido(uuid) to authenticated;
revoke execute on function public.marcar_comissoes_atrasadas() from public, anon, authenticated;

-- 09:00 UTC = 06:00 em Brasília
create extension if not exists pg_cron;
select cron.schedule('comissoes-atrasadas', '0 9 * * *', 'select public.marcar_comissoes_atrasadas()');
