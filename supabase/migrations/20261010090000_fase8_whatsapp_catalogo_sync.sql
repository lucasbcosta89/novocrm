-- FASE 8: WhatsApp-first, catálogo público e sync do app mobile

/* ---------- SYNC (local-first): updated_at + exclusões ---------- */
create or replace function public.definir_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

alter table clientes add column updated_at timestamptz not null default now();
alter table pedidos add column updated_at timestamptz not null default now();
alter table pedidos add column observacoes text;
create trigger clientes_updated_at before update on clientes for each row execute function public.definir_updated_at();
create trigger visitas_updated_at before update on visitas for each row execute function public.definir_updated_at();
create trigger pedidos_updated_at before update on pedidos for each row execute function public.definir_updated_at();
create index clientes_sync_idx on clientes (user_id, updated_at);
create index visitas_sync_idx on visitas (user_id, updated_at);
create index pedidos_sync_idx on pedidos (user_id, updated_at);

create table sync_exclusoes (
  id bigserial primary key,
  user_id uuid not null references usuarios(id) on delete cascade,
  tabela text not null,
  registro_id uuid not null,
  excluido_em timestamptz not null default now()
);
create index sync_exclusoes_idx on sync_exclusoes (user_id, excluido_em);
alter table sync_exclusoes enable row level security;
create policy sync_exclusoes_leitura on sync_exclusoes for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.registrar_exclusao() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into sync_exclusoes (user_id, tabela, registro_id) values (old.user_id, tg_table_name, old.id);
  return old;
end $$;
create trigger clientes_exclusao after delete on clientes for each row execute function public.registrar_exclusao();
create trigger visitas_exclusao after delete on visitas for each row execute function public.registrar_exclusao();
create trigger pedidos_exclusao after delete on pedidos for each row execute function public.registrar_exclusao();

/* ---------- criar_pedido com id do cliente (UUID gerado no app; idempotente) ---------- */
drop function public.criar_pedido(uuid, uuid, jsonb, text, boolean);
create function public.criar_pedido(
  p_representada_id uuid, p_cliente_id uuid, p_itens jsonb,
  p_forma_pagamento text default null, p_confirmar boolean default false, p_id uuid default null
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
  if p_id is not null and exists (select 1 from pedidos where id = p_id) then return p_id; end if; -- reenvio do sync
  if not exists (select 1 from representadas where id = p_representada_id) then raise exception 'Representada não encontrada'; end if;
  if not exists (select 1 from clientes where id = p_cliente_id) then raise exception 'Cliente não encontrado'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item';
  end if;

  insert into pedidos (id, user_id, representada_id, cliente_id, numero, status, forma_pagamento, origem)
  values (
    coalesce(p_id, gen_random_uuid()), v_uid, p_representada_id, p_cliente_id,
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
revoke execute on function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid) from public, anon;
grant execute on function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid) to authenticated;

/* ---------- Pedido pelo catálogo público (chamado só pelo servidor com service role) ---------- */
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
  end if;
  insert into cliente_representada (cliente_id, representada_id) values (v_cli, v_rep.id) on conflict do nothing;

  v_num := 'P' || lpad(((select count(*) from pedidos where user_id = v_rep.user_id) + 1)::text, 6, '0');
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

/* ---------- WhatsApp ---------- */
alter table conversas_whatsapp
  add column cliente_id uuid references clientes(id) on delete set null,
  add column iniciada_por text not null default 'empresa' check (iniciada_por in ('empresa', 'cliente')),
  add column janela_expira_em timestamptz;
create unique index conversas_meta_key on conversas_whatsapp (meta_conversa_id) where meta_conversa_id is not null;
create index conversas_contato_idx on conversas_whatsapp (user_id, contato, janela_expira_em desc);

-- Quota conversas_mes só conta conversas abertas pela empresa (as de atendimento iniciadas pelo cliente são gratuitas na Meta).
drop trigger quota_conversas on conversas_whatsapp;
create trigger quota_conversas before insert on conversas_whatsapp
  for each row when (new.iniciada_por = 'empresa') execute function public.quota_trigger('conversas_mes', 'mensal');

create table mensagens_whatsapp (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  conversa_id uuid references conversas_whatsapp(id) on delete set null,
  cliente_id uuid references clientes(id) on delete set null,
  direcao text not null check (direcao in ('entrada', 'saida')),
  contato text not null,
  template text,
  conteudo jsonb not null default '{}',
  meta_message_id text unique,
  status text not null default 'enviada',
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index mensagens_contato_idx on mensagens_whatsapp (contato, criado_em desc);
create index mensagens_cliente_idx on mensagens_whatsapp (cliente_id, criado_em desc);
alter table mensagens_whatsapp enable row level security;
create policy mensagens_leitura on mensagens_whatsapp for select to authenticated using ((select auth.uid()) = user_id);

alter table templates_whatsapp
  add column codigo text,
  add column meta_nome text,
  add column idioma text not null default 'pt_BR',
  add column variaveis text[] not null default '{}';
create unique index templates_globais_codigo_key on templates_whatsapp (codigo) where user_id is null;

-- Templates prontos (globais). Cadastre-os com o mesmo meta_nome no WhatsApp Manager para aprovação.
insert into templates_whatsapp (user_id, codigo, nome, meta_nome, categoria, idioma, variaveis, corpo) values
  (null, 'envio_catalogo', 'Envio de catálogo', 'crm_envio_catalogo', 'marketing', 'pt_BR',
   '{nome_cliente,nome_rep,marca,link}',
   'Olá {{1}}! Aqui é {{2}}. Segue o catálogo atualizado da {{3}}: {{4}} — é só escolher os itens e enviar o pedido por lá.'),
  (null, 'confirmacao_pedido', 'Confirmação de pedido', 'crm_confirmacao_pedido', 'utility', 'pt_BR',
   '{nome_cliente,numero,marca,valor}',
   'Olá {{1}}! Recebemos seu pedido {{2}} da {{3}} no valor de {{4}}. Em breve entraremos em contato para confirmar a entrega.'),
  (null, 'follow_up_visita', 'Follow-up pós-visita', 'crm_follow_up_visita', 'marketing', 'pt_BR',
   '{nome_cliente,nome_rep}',
   'Olá {{1}}! Aqui é {{2}}. Passando para saber se ficou alguma dúvida desde a nossa última conversa e se posso ajudar com um novo pedido.')
on conflict do nothing;

/* ---------- Follow-up pós-visita (15 dias) ---------- */
alter table tarefas add column origem text, add column ref_id uuid, add column tipo text;
create unique index tarefas_origem_ref_key on tarefas (origem, ref_id) where ref_id is not null;

-- Diário: visita de 15 dias atrás sem visita/pedido posterior do mesmo cliente → tarefa de follow-up (WhatsApp).
create or replace function public.gerar_followups_visitas() returns integer
language sql security definer set search_path = public, pg_temp as $$
  with alvo as (
    select v.id, v.user_id, v.cliente_id, v.representada_id, c.nome
      from visitas v join clientes c on c.id = v.cliente_id
     where (v.data at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date - 15
       and not exists (select 1 from visitas v2 where v2.cliente_id = v.cliente_id and v2.data > v.data)
       and not exists (select 1 from pedidos p where p.cliente_id = v.cliente_id and p.data > v.data and p.status <> 'cancelado')
  ), ins as (
    insert into tarefas (user_id, cliente_id, representada_id, titulo, data, origem, ref_id, tipo)
    select user_id, cliente_id, representada_id, 'Follow-up pós-visita: ' || nome,
           (now() at time zone 'America/Sao_Paulo')::date, 'visita', id, 'follow_up_whatsapp'
      from alvo
    on conflict do nothing
    returning 1
  ) select count(*)::int from ins;
$$;
revoke execute on function public.gerar_followups_visitas() from public, anon, authenticated;
revoke execute on function public.registrar_exclusao() from public, anon, authenticated;

-- 09:20 UTC = 06:20 em Brasília
select cron.schedule('followup-visitas', '20 9 * * *', 'select public.gerar_followups_visitas()');
