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
