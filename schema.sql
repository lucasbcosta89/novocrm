-- CRM Multimarcas — schema.sql (Supabase/Postgres). Fonte única. Rodar: supabase db push

-- PLANOS E LIMITES (Fase 6)
create table planos (
  codigo text primary key,              -- solo | profissional | pro
  nome text not null,
  preco numeric(10,2) not null,
  limites jsonb not null default '{}'   -- {representadas, clientes, conversas_mes, pdf_mes, oportunidades}
);

-- IDENTIDADE E PLANO
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  nome text not null,
  whatsapp text,
  documento text,
  plano text not null default 'solo' references planos(codigo),
  status text not null default 'ativo',
  criado_em timestamptz not null default now()
);

create table usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  recurso text not null,                -- representadas|clientes|conversas_mes|pdf_mes|oportunidades
  mes text not null,                    -- '2026-10'
  contador int not null default 0,
  unique (user_id, recurso, mes)
);

-- MULTIMARCAS (Fase 2)
create table representadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  nome text not null,
  cnpj text,
  comissao_padrao numeric(5,2) not null default 0,   -- %
  slug text,                                          -- slug público do catálogo digital
  catalogo_publico boolean not null default false,
  criar_pedido_publico boolean not null default false,
  status text not null default 'ativa',
  criado_em timestamptz not null default now()
);

-- CARTEIRA GLOBAL (Fase 3)
create table clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  nome text not null,
  documento text,                       -- CPF/CNPJ
  email text,
  celular text,
  whatsapp text,
  cidade text,
  uf text,
  cep text,
  segmento text,
  anotacoes text,
  status text not null default 'ativo',
  criado_em timestamptz not null default now()
);

-- cliente em UMA OU MAIS representadas (Fase 3)
create table cliente_representada (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  representada_id uuid not null references representadas(id) on delete cascade,
  status text not null default 'ativo',
  observacoes text,
  criado_em timestamptz not null default now(),
  unique (cliente_id, representada_id)
);

-- CATÁLOGO E PREÇO POR REPRESENTADA (Fases 2/7)
create table produtos (
  id uuid primary key default gen_random_uuid(),
  representada_id uuid not null references representadas(id) on delete cascade,
  sku text not null,
  nome text not null,
  descricao text,
  preco numeric(12,2) not null default 0,
  unidade text,
  imagem_url text,                      -- aponta para R2
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (representada_id, sku)
);

create table tabelas_preco (
  id uuid primary key default gen_random_uuid(),
  representada_id uuid not null references representadas(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete cascade,  -- null = preço padrão
  produto_id uuid not null references produtos(id) on delete cascade,
  preco numeric(12,2) not null,
  desconto_max numeric(5,2) default 0
);

-- PEDIDOS E COMISSÃO (Fase 5)
create table pedidos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  representada_id uuid not null references representadas(id),
  cliente_id uuid not null references clientes(id),
  numero text not null,
  data timestamptz not null default now(),
  status text not null default 'confirmado',  -- rascunho|confirmado|entregue|cancelado
  valor_total numeric(12,2) not null default 0,
  comissao_total numeric(12,2) not null default 0,
  forma_pagamento text,
  origem text not null default 'app',          -- app|catalogo_web|whatsapp
  criado_em timestamptz not null default now()
);

create table pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  produto_id uuid references produtos(id),
  descricao text,
  quantidade numeric(12,3) not null default 1,
  preco_unitario numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0
);

create table comissoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  representada_id uuid not null references representadas(id),
  pedido_id uuid references pedidos(id) on delete set null,
  percentual numeric(5,2) not null,
  valor numeric(12,2) not null,
  status text not null default 'a_receber',     -- a_receber|recebida|atrasada
  data_prevista timestamptz,
  observacoes text,
  criado_em timestamptz not null default now()
);

-- OPORTUNIDADES E DESAFIOS POR CLIENTE + PLANO DE AÇÃO (Fase 4)
create table oportunidades_desafios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  representada_id uuid references representadas(id) on delete set null,
  tipo text not null check (tipo in ('oportunidade','desafio')),
  titulo text not null,
  descricao text,
  valor_estimado numeric(12,2),
  prioridade text not null default 'media',     -- baixa|media|alta
  status text not null default 'aberta',        -- aberta|em_andamento|concluida|nao_aplicavel
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table plano_acao (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidades_desafios(id) on delete cascade,
  descricao text not null,
  responsavel text,
  prazo date,
  status text not null default 'pendente',      -- pendente|em_andamento|concluida
  criado_em timestamptz not null default now()
);

-- ROTINA DE CAMPO / OFFLINE-FIRST (Fases 3/8)
create table visitas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  cliente_id uuid not null references clientes(id),
  representada_id uuid references representadas(id) on delete set null,
  data timestamptz not null default now(),
  tipo text not null default 'presencial',       -- presencial|telefone|whatsapp|video
  anotacoes text,
  resultado text,
  sync_status text not null default 'sincronizado',  -- pendente|sincronizado
  updated_at timestamptz not null default now()
);

create table tarefas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete cascade,
  representada_id uuid references representadas(id) on delete cascade,
  titulo text not null,
  data date,
  concluida boolean not null default false,
  criado_em timestamptz not null default now()
);

-- WHATSAPP (Fase 8)
create table templates_whatsapp (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references usuarios(id) on delete cascade,  -- null = template global
  nome text not null,
  categoria text not null default 'utility',   -- utility|marketing|authentication
  corpo text not null,
  criado_em timestamptz not null default now()
);

create table conversas_whatsapp (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  contato text not null,
  meta_conversa_id text,
  categoria text not null,
  status text not null,                      -- open|closed
  custo numeric(10,2) not null default 0,
  mes text not null,                         -- '2026-10' (para quota)
  criado_em timestamptz not null default now()
);

-- ASSINATURAS MERCADO PAGO (Fase 6)
create table assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  plano text not null,
  status text not null default 'pending',    -- pending|active|cancelled|paused
  external_reference text unique,
  mp_preapproval_id text,
  mp_customer_id text,
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  criado_em timestamptz not null default now()
);

create table webhook_events (
  id text primary key,                       -- id do evento MP (idempotência)
  type text not null,
  processed_at timestamptz not null default now()
);

-- DOCUMENTOS PDF E ARQUIVOS (Fases 7/8)
create table documentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  tipo text not null,                        -- relatorio_periodo|relatorio_comissao|catalogo
  representada_id uuid references representadas(id) on delete set null,
  periodo text,
  hash_cache text,                           -- evita regeneração
  r2_key text not null,
  status text not null default 'gerando',    -- gerando|pronto|falha
  criado_em timestamptz not null default now(),
  unique (user_id, hash_cache)
);

create table uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  representada_id uuid references representadas(id) on delete set null,
  tipo text not null,                        -- foto_produto|avatar|documento
  r2_key text not null,
  criado_em timestamptz not null default now()
);

-- SEED: planos (limite null = ilimitado)
insert into planos (codigo, nome, preco, limites) values
  ('solo',         'Solo',         0, '{"representadas":1,"clientes":100,"conversas_mes":200}'),
  ('profissional', 'Profissional', 0, '{"representadas":3,"clientes":1000,"conversas_mes":500}'),
  ('pro',          'Pro',          0, '{"representadas":null,"clientes":null,"conversas_mes":1500}')
on conflict (codigo) do update set nome = excluded.nome, limites = excluded.limites;

-- AUTH: cria linha em usuarios a cada signup no Supabase Auth
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.usuarios (id, email, nome)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'nome', ''), split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- RLS: tudo fechado por padrão (API usa service role); políticas só onde o usuário lê direto.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy planos_leitura on planos for select to authenticated using (true);
create policy usuarios_proprio_select on usuarios for select to authenticated using ((select auth.uid()) = id);
create policy usuarios_proprio_update on usuarios for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- FASE 2 (multimarcas): unicidade + RLS por dono
create unique index representadas_slug_key on representadas (slug);
create index representadas_user_idx on representadas (user_id);
create unique index clientes_user_documento_key on clientes (user_id, documento) where documento is not null;
create index clientes_user_idx on clientes (user_id);
create index cliente_representada_representada_idx on cliente_representada (representada_id);
alter table tabelas_preco add constraint tabelas_preco_produto_cliente_key unique nulls not distinct (produto_id, cliente_id);
create index tabelas_preco_representada_idx on tabelas_preco (representada_id);

create policy representadas_dono on representadas for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy clientes_dono on clientes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy cliente_representada_dono on cliente_representada for all to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid())))
  with check (
    exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid()))
    and exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid()))
  );

create policy produtos_dono on produtos for all to authenticated
  using (exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid())));

create policy tabelas_preco_dono on tabelas_preco for all to authenticated
  using (exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid())))
  with check (
    exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid()))
    and exists (select 1 from produtos p where p.id = produto_id and p.representada_id = tabelas_preco.representada_id)
  );

-- FASE 3: RLS básico por dono
create index visitas_cliente_idx on visitas (cliente_id, data desc);
create index pedidos_cliente_idx on pedidos (cliente_id);
create index pedidos_representada_idx on pedidos (representada_id);
create index oportunidades_cliente_idx on oportunidades_desafios (cliente_id);

-- dono direto (user_id), leitura e escrita
create policy pedidos_dono on pedidos for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid()))
    and exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid()))
  );
create policy comissoes_dono on comissoes for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid()))
  );
create policy visitas_dono on visitas for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid()))
    and (representada_id is null or exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid())))
  );
create policy tarefas_dono on tarefas for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy documentos_dono on documentos for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy uploads_dono on uploads for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- templates: globais (user_id null) visíveis a todos; escrita só nos próprios
create policy templates_leitura on templates_whatsapp for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);
create policy templates_escrita on templates_whatsapp for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- billing/quota: usuário só lê; escrita via service role
create policy usage_leitura on usage for select to authenticated using ((select auth.uid()) = user_id);
create policy assinaturas_leitura on assinaturas for select to authenticated using ((select auth.uid()) = user_id);
create policy conversas_leitura on conversas_whatsapp for select to authenticated using ((select auth.uid()) = user_id);

-- tabelas filhas: dono via pai
create policy pedido_itens_dono on pedido_itens for all to authenticated
  using (exists (select 1 from pedidos p where p.id = pedido_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from pedidos p where p.id = pedido_id and p.user_id = (select auth.uid())));
create policy oportunidades_dono on oportunidades_desafios for all to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid())));
create policy plano_acao_dono on plano_acao for all to authenticated
  using (exists (select 1 from oportunidades_desafios o join clientes c on c.id = o.cliente_id
                 where o.id = oportunidade_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from oportunidades_desafios o join clientes c on c.id = o.cliente_id
                      where o.id = oportunidade_id and c.user_id = (select auth.uid())));
-- webhook_events: sem política (só service role)

-- FASE 4: oportunidades/desafios + plano de ação
alter table oportunidades_desafios
  add constraint oportunidades_prioridade_check check (prioridade in ('baixa','media','alta')),
  add constraint oportunidades_status_check check (status in ('aberta','em_andamento','concluida','nao_aplicavel'));
alter table plano_acao
  add constraint plano_acao_status_check check (status in ('pendente','em_andamento','concluida'));
create index plano_acao_oportunidade_idx on plano_acao (oportunidade_id);

-- representada opcional também precisa ser do usuário
drop policy oportunidades_dono on oportunidades_desafios;
create policy oportunidades_dono on oportunidades_desafios for all to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid())))
  with check (
    exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid()))
    and (representada_id is null or exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid())))
  );

-- FASE 5: pedidos + comissao por produto
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

-- FASE 6: planos, quota e assinaturas

-- Preços e limites (null = ilimitado)
update planos set preco = 49,  limites = '{"representadas":1,"clientes":100,"conversas_mes":200,"pdf_mes":30,"oportunidades":100}' where codigo = 'solo';
update planos set preco = 89,  limites = '{"representadas":3,"clientes":1000,"conversas_mes":500,"pdf_mes":100,"oportunidades":1000}' where codigo = 'profissional';
update planos set preco = 149, limites = '{"representadas":null,"clientes":null,"conversas_mes":1500,"pdf_mes":null,"oportunidades":null}' where codigo = 'pro';

-- oportunidades ganham dono direto (necessário para quota e para delete em cascata)
alter table oportunidades_desafios add column user_id uuid references usuarios(id) on delete cascade;
update oportunidades_desafios o set user_id = c.user_id from clientes c where c.id = o.cliente_id;
alter table oportunidades_desafios alter column user_id set not null;

create or replace function public.oportunidade_define_dono() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  select user_id into new.user_id from clientes where id = new.cliente_id;
  return new;
end $$;
create trigger oportunidades_dono before insert on oportunidades_desafios
  for each row execute function public.oportunidade_define_dono();

-- Mês corrente (Brasília) para recursos mensais; 'total' para acumulados.
create or replace function public.mes_quota(p_mensal boolean) returns text
language sql stable set search_path = public, pg_temp as $$
  select case when p_mensal then to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM') else 'total' end;
$$;

-- Consome 1 unidade da quota com lock; levanta LIMITE_ATINGIDO se o plano não comporta.
create or replace function public.consumir_quota(p_user_id uuid, p_recurso text, p_mensal boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_mes text := mes_quota(p_mensal);
  v_plano text;
  v_limite int;
  v_usado int;
begin
  select u.plano, (p.limites ->> p_recurso)::int into v_plano, v_limite
    from usuarios u join planos p on p.codigo = u.plano where u.id = p_user_id;

  insert into usage (user_id, recurso, mes, contador) values (p_user_id, p_recurso, v_mes, 0)
  on conflict (user_id, recurso, mes) do nothing;
  select contador into v_usado from usage
   where user_id = p_user_id and recurso = p_recurso and mes = v_mes for update;

  if v_limite is not null and v_usado >= v_limite then
    raise exception 'Limite do plano % atingido: % %. Faça upgrade para continuar.', v_plano, v_limite, replace(p_recurso, '_', ' ')
      using hint = 'LIMITE_ATINGIDO';
  end if;

  update usage set contador = contador + 1
   where user_id = p_user_id and recurso = p_recurso and mes = v_mes;
end $$;

-- Trigger genérico: TG_ARGV[0] = recurso, TG_ARGV[1] = 'mensal' | 'total'. Mensal não devolve no delete.
create or replace function public.quota_trigger() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_mensal boolean := tg_argv[1] = 'mensal';
begin
  if tg_op = 'INSERT' then
    perform consumir_quota(new.user_id, tg_argv[0], v_mensal);
    return new;
  end if;
  if not v_mensal then
    update usage set contador = greatest(contador - 1, 0)
     where user_id = old.user_id and recurso = tg_argv[0] and mes = 'total';
  end if;
  return old;
end $$;

create trigger quota_representadas before insert or delete on representadas
  for each row execute function public.quota_trigger('representadas', 'total');
create trigger quota_clientes before insert or delete on clientes
  for each row execute function public.quota_trigger('clientes', 'total');
create trigger quota_oportunidades before insert or delete on oportunidades_desafios
  for each row execute function public.quota_trigger('oportunidades', 'total');
create trigger quota_conversas before insert on conversas_whatsapp
  for each row execute function public.quota_trigger('conversas_mes', 'mensal');
create trigger quota_pdfs before insert on documentos
  for each row execute function public.quota_trigger('pdf_mes', 'mensal');

-- oportunidades: trigger de dono roda antes da quota (ordem alfabética: oportunidades_dono < quota_*)

-- Backfill do uso atual
insert into usage (user_id, recurso, mes, contador)
select user_id, 'representadas', 'total', count(*) from representadas group by user_id
union all select user_id, 'clientes', 'total', count(*) from clientes group by user_id
union all select user_id, 'oportunidades', 'total', count(*) from oportunidades_desafios group by user_id
on conflict (user_id, recurso, mes) do update set contador = excluded.contador;

-- ASSINATURAS
create unique index assinaturas_user_key on assinaturas (user_id);
create index assinaturas_preapproval_idx on assinaturas (mp_preapproval_id);

-- Pagamentos aplicados (idempotência por payment_id do MP)
create table assinatura_pagamentos (
  payment_id text primary key,
  assinatura_id uuid not null references assinaturas(id) on delete cascade,
  valor numeric(10,2),
  aprovado_em timestamptz not null default now()
);
alter table assinatura_pagamentos enable row level security;
create policy assinatura_pagamentos_leitura on assinatura_pagamentos for select to authenticated
  using (exists (select 1 from assinaturas a where a.id = assinatura_id and a.user_id = (select auth.uid())));

-- Fila/idempotência de notificações do MP (PK = id da notificação)
alter table webhook_events
  add column recurso_id text,
  add column payload jsonb,
  add column status text not null default 'pendente' check (status in ('pendente','processado','erro','ignorado')),
  add column tentativas int not null default 0,
  add column erro text,
  add column recebido_em timestamptz not null default now(),
  alter column processed_at drop not null,
  alter column processed_at drop default;
update webhook_events set status = 'processado' where processed_at is not null;
create index webhook_events_pendentes_idx on webhook_events (status, recebido_em) where status in ('pendente','erro');

-- Aplica pagamento aprovado: 1º pagamento ativa plano; seguintes estendem periodo_fim. Idempotente.
create or replace function public.aplicar_pagamento_assinatura(
  p_payment_id text, p_preapproval_id text, p_external_reference text, p_valor numeric
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_a assinaturas%rowtype;
begin
  select * into v_a from assinaturas
   where (p_preapproval_id is not null and mp_preapproval_id = p_preapproval_id)
      or (p_external_reference is not null and external_reference = p_external_reference)
   order by (mp_preapproval_id = p_preapproval_id) desc nulls last
   limit 1 for update;
  if not found then return 'assinatura_nao_encontrada'; end if;

  insert into assinatura_pagamentos (payment_id, assinatura_id, valor) values (p_payment_id, v_a.id, p_valor)
  on conflict (payment_id) do nothing;
  if not found then return 'duplicado'; end if;

  if v_a.status <> 'active' or v_a.periodo_fim is null or v_a.periodo_fim < now() - interval '7 days' then
    update assinaturas set status = 'active', periodo_inicio = now(), periodo_fim = now() + interval '1 month'
     where id = v_a.id;
    update usuarios set plano = v_a.plano where id = v_a.user_id;
    return 'ativada';
  end if;

  update assinaturas set periodo_fim = greatest(periodo_fim, now()) + interval '1 month' where id = v_a.id;
  update usuarios set plano = v_a.plano where id = v_a.user_id;
  return 'estendida';
end $$;

-- Job diário: assinatura vencida há mais de 7 dias (carência) → downgrade para solo, sem apagar dados.
create or replace function public.aplicar_carencia_assinaturas() returns integer
language sql security definer set search_path = public, pg_temp as $$
  with vencidas as (
    update assinaturas set status = 'expired'
     where status in ('active', 'paused', 'cancelled') and periodo_fim is not null
       and periodo_fim + interval '7 days' < now()
    returning user_id
  ), rebaixados as (
    update usuarios u set plano = 'solo' from vencidas v where u.id = v.user_id and u.plano <> 'solo'
    returning 1
  ) select count(*)::int from rebaixados;
$$;

revoke execute on function public.consumir_quota(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.aplicar_pagamento_assinatura(text, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.aplicar_carencia_assinaturas() from public, anon, authenticated;
revoke execute on function public.quota_trigger() from public, anon, authenticated;
revoke execute on function public.oportunidade_define_dono() from public, anon, authenticated;

-- 09:10 UTC = 06:10 em Brasília
select cron.schedule('assinaturas-carencia', '10 9 * * *', 'select public.aplicar_carencia_assinaturas()');

-- Usuário só edita dados de perfil (plano/status só via service role / funções de assinatura)
revoke update on usuarios from authenticated, anon;
grant update (nome, whatsapp, documento) on usuarios to authenticated;

-- Preapproval substituída em upgrade (cancelada no MP quando a nova é paga)
alter table assinaturas add column mp_preapproval_anterior text;

-- Upgrade seguro: pagamento da preapproval antiga mantém o plano antigo; só a nova libera o plano novo.
alter table assinaturas add column plano_anterior text;

drop function public.aplicar_pagamento_assinatura(text, text, text, numeric);
create function public.aplicar_pagamento_assinatura(
  p_payment_id text, p_preapproval_id text, p_external_reference text, p_valor numeric
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_a assinaturas%rowtype;
  v_plano text;
  v_cancelar text;
  v_resultado text;
begin
  select * into v_a from assinaturas
   where (p_preapproval_id is not null and (mp_preapproval_id = p_preapproval_id or mp_preapproval_anterior = p_preapproval_id))
      or (p_external_reference is not null and external_reference = p_external_reference)
   limit 1 for update;
  if not found then return jsonb_build_object('resultado', 'assinatura_nao_encontrada'); end if;

  insert into assinatura_pagamentos (payment_id, assinatura_id, valor) values (p_payment_id, v_a.id, p_valor)
  on conflict (payment_id) do nothing;
  if not found then return jsonb_build_object('resultado', 'duplicado'); end if;

  if v_a.mp_preapproval_anterior is not null and p_preapproval_id is distinct from v_a.mp_preapproval_id then
    -- pagamento da assinatura antiga (ou não identificável): mantém plano antigo
    v_plano := coalesce(v_a.plano_anterior, v_a.plano);
  else
    v_plano := v_a.plano;
    v_cancelar := v_a.mp_preapproval_anterior;
    update assinaturas set mp_preapproval_anterior = null, plano_anterior = null where id = v_a.id;
  end if;

  if v_a.status <> 'active' or v_a.periodo_fim is null or v_a.periodo_fim < now() - interval '7 days' then
    update assinaturas set status = 'active', periodo_inicio = now(), periodo_fim = now() + interval '1 month' where id = v_a.id;
    v_resultado := 'ativada';
  else
    update assinaturas set periodo_fim = greatest(periodo_fim, now()) + interval '1 month' where id = v_a.id;
    v_resultado := 'estendida';
  end if;
  update usuarios set plano = v_plano where id = v_a.user_id;
  return jsonb_build_object('resultado', v_resultado, 'plano', v_plano, 'cancelar_preapproval', v_cancelar);
end $$;
revoke execute on function public.aplicar_pagamento_assinatura(text, text, text, numeric) from public, anon, authenticated;

-- FASE 7: PDFs (relatorios e catalogos)
alter table documentos
  add column titulo text,
  add column parametros jsonb not null default '{}',
  add column tamanho int,
  add column erro text,
  add column gerado_em timestamptz,
  add constraint documentos_tipo_check check (tipo in ('relatorio_periodo','relatorio_comissao','catalogo')),
  add constraint documentos_status_check check (status in ('gerando','pronto','falha'));
create index documentos_user_criado_idx on documentos (user_id, criado_em desc);

-- agrupamento do catálogo
alter table produtos add column categoria text;

-- Arquivos privados (PDFs e imagens): acesso só pelo servidor (service role); download via rota autenticada.
-- Quando o R2 for habilitado, o app passa a usar o binding ARQUIVOS (ver server/armazenamento.ts).
insert into storage.buckets (id, name, public, file_size_limit)
values ('arquivos', 'arquivos', false, 10485760)
on conflict (id) do nothing;

-- FASE 8: WhatsApp, catalogo publico e sync mobile

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
