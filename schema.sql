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

-- FASE 4b: pagina global de oportunidades (kanban)

-- Status unificados (oportunidade e plano de ação): nao_iniciado | em_progresso | atrasado | cancelado | concluido
alter table oportunidades_desafios drop constraint oportunidades_status_check;
update oportunidades_desafios set status = case status
  when 'aberta' then 'nao_iniciado' when 'em_andamento' then 'em_progresso'
  when 'concluida' then 'concluido' when 'nao_aplicavel' then 'cancelado' else status end;
alter table oportunidades_desafios alter column status set default 'nao_iniciado';
alter table oportunidades_desafios add constraint oportunidades_status_check
  check (status in ('nao_iniciado','em_progresso','atrasado','cancelado','concluido'));

alter table plano_acao drop constraint plano_acao_status_check;
update plano_acao set status = case status
  when 'pendente' then 'nao_iniciado' when 'em_andamento' then 'em_progresso' when 'concluida' then 'concluido' else status end;
alter table plano_acao alter column status set default 'nao_iniciado';
alter table plano_acao add constraint plano_acao_status_check
  check (status in ('nao_iniciado','em_progresso','atrasado','cancelado','concluido'));
alter table plano_acao add column data_entrega date, add column observacoes text;

-- Novos campos; cliente opcional (oportunidade de produto sem cliente)
alter table oportunidades_desafios
  add column cidade text,
  add column estado text,
  add column resultado text check (resultado in ('ganhou', 'perdeu')),
  add column observacoes_resultado text,
  add column data_conclusao timestamptz,
  alter column cliente_id drop not null;
create index oportunidades_user_status_idx on oportunidades_desafios (user_id, status);

-- Dono: do cliente quando houver; senão do usuário logado
create or replace function public.oportunidade_define_dono() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.cliente_id is not null then
    select user_id into new.user_id from clientes where id = new.cliente_id;
  else
    new.user_id := coalesce(new.user_id, auth.uid());
  end if;
  return new;
end $$;

-- RLS passa a usar user_id (cliente pode ser nulo)
drop policy oportunidades_dono on oportunidades_desafios;
create policy oportunidades_dono on oportunidades_desafios for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (cliente_id is null or exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid())))
    and (representada_id is null or exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid())))
  );

drop policy plano_acao_dono on plano_acao;
create policy plano_acao_dono on plano_acao for all to authenticated
  using (exists (select 1 from oportunidades_desafios o where o.id = oportunidade_id and o.user_id = (select auth.uid())))
  with check (exists (select 1 from oportunidades_desafios o where o.id = oportunidade_id and o.user_id = (select auth.uid())));

-- Produtos da oportunidade (sempre da representada da oportunidade)
create table oportunidade_produtos (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references oportunidades_desafios(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  quantidade numeric(12,3) not null default 1 check (quantidade > 0),
  unique (oportunidade_id, produto_id)
);
create index oportunidade_produtos_produto_idx on oportunidade_produtos (produto_id);
alter table oportunidade_produtos enable row level security;
create policy oportunidade_produtos_dono on oportunidade_produtos for all to authenticated
  using (exists (select 1 from oportunidades_desafios o where o.id = oportunidade_id and o.user_id = (select auth.uid())))
  with check (exists (
    select 1 from oportunidades_desafios o join produtos p on p.id = produto_id
     where o.id = oportunidade_id and o.user_id = (select auth.uid()) and p.representada_id = o.representada_id
  ));

-- FASE 6b: cadastro pos-checkout, dados do usuario e LGPD
create extension if not exists pgcrypto with schema extensions;

alter table usuarios
  add column cpf text,                    -- cifrado (pgp_sym_encrypt, base64); chave só no .env do servidor
  add column nome_empresa text,
  add column cnpj text,                   -- cifrado (idem)
  add column rua text,
  add column numero text,
  add column municipio text,
  add column estado text check (estado in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  add column consentimento_lgpd_aceito_em timestamptz,
  add column consentimento_lgpd_versao text,
  add column politica_privacidade_aceita_em timestamptz,
  add column politica_privacidade_versao text;

/* ---------- Dígitos verificadores ---------- */
create or replace function public.cpf_valido(p text) returns boolean
language plpgsql immutable set search_path = pg_temp as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; r int; i int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end $$;

create or replace function public.cnpj_valido(p text) returns boolean
language plpgsql immutable set search_path = pg_temp as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  p1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  p2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; r int; i int;
begin
  if length(d) <> 14 or d ~ '^(\d)\1{13}$' then return false; end if;
  s := 0; for i in 1..12 loop s := s + substr(d, i, 1)::int * p1[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  if r <> substr(d, 13, 1)::int then return false; end if;
  s := 0; for i in 1..13 loop s := s + substr(d, i, 1)::int * p2[i]; end loop;
  r := s % 11; r := case when r < 2 then 0 else 11 - r end;
  return r = substr(d, 14, 1)::int;
end $$;

/* ---------- CPF/CNPJ só entram pela função que valida o DV (trigger de proteção) ---------- */
create or replace function public.usuarios_protege_documentos() returns trigger
language plpgsql set search_path = pg_temp as $$
begin
  if (new.cpf is distinct from (case when tg_op = 'UPDATE' then old.cpf end)
      or new.cnpj is distinct from (case when tg_op = 'UPDATE' then old.cnpj end))
     and coalesce(current_setting('app.documentos_validados', true), '') <> 'on' then
    raise exception 'CPF/CNPJ só podem ser gravados após validação (salvar_dados_usuario)';
  end if;
  return new;
end $$;
create trigger usuarios_documentos before insert or update on usuarios
  for each row execute function public.usuarios_protege_documentos();

/* ---------- Gravação (valida DV no banco, cifra, registra aceites) ---------- */
create or replace function public.salvar_dados_usuario(
  p_dados jsonb, p_chave text, p_versao_lgpd text default null, p_versao_politica text default null
) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_cpf text := regexp_replace(coalesce(p_dados->>'cpf', ''), '\D', '', 'g');
  v_cnpj text := nullif(regexp_replace(coalesce(p_dados->>'cnpj', ''), '\D', '', 'g'), '');
  v_uf text := upper(trim(coalesce(p_dados->>'estado', '')));
begin
  if v_uid is null then raise exception 'Não autenticado'; end if;
  if p_chave is null or length(p_chave) < 32 then raise exception 'Chave de criptografia ausente no servidor'; end if;
  if length(trim(coalesce(p_dados->>'nome', ''))) < 2 then raise exception 'Informe o nome'; end if;
  if not cpf_valido(v_cpf) then raise exception 'CPF inválido'; end if;
  if v_cnpj is not null and not cnpj_valido(v_cnpj) then raise exception 'CNPJ inválido'; end if;
  if length(trim(coalesce(p_dados->>'rua', ''))) < 2 then raise exception 'Informe a rua'; end if;
  if length(trim(coalesce(p_dados->>'numero', ''))) < 1 then raise exception 'Informe o número (ou S/N)'; end if;
  if length(trim(coalesce(p_dados->>'municipio', ''))) < 2 then raise exception 'Informe o município'; end if;

  perform set_config('app.documentos_validados', 'on', true);
  update usuarios set
    nome = left(trim(p_dados->>'nome'), 160),
    cpf = encode(pgp_sym_encrypt(v_cpf, p_chave), 'base64'),
    nome_empresa = nullif(left(trim(coalesce(p_dados->>'nome_empresa', '')), 160), ''),
    cnpj = case when v_cnpj is null then null else encode(pgp_sym_encrypt(v_cnpj, p_chave), 'base64') end,
    rua = left(trim(p_dados->>'rua'), 160),
    numero = left(trim(p_dados->>'numero'), 20),
    municipio = left(trim(p_dados->>'municipio'), 80),
    estado = nullif(v_uf, ''),
    consentimento_lgpd_aceito_em = case when p_versao_lgpd is not null then now() else consentimento_lgpd_aceito_em end,
    consentimento_lgpd_versao = coalesce(p_versao_lgpd, consentimento_lgpd_versao),
    politica_privacidade_aceita_em = case when p_versao_politica is not null then now() else politica_privacidade_aceita_em end,
    politica_privacidade_versao = coalesce(p_versao_politica, politica_privacidade_versao)
  where id = v_uid;
  perform set_config('app.documentos_validados', 'off', true);
end $$;

/* ---------- Leitura dos documentos completos: só o próprio usuário ---------- */
create or replace function public.obter_documentos_usuario(p_chave text)
returns table (cpf text, cnpj text)
language sql security definer set search_path = public, extensions, pg_temp as $$
  select
    case when u.cpf is null then null else pgp_sym_decrypt(decode(u.cpf, 'base64'), p_chave) end,
    case when u.cnpj is null then null else pgp_sym_decrypt(decode(u.cnpj, 'base64'), p_chave) end
  from usuarios u where u.id = auth.uid();
$$;

revoke execute on function public.salvar_dados_usuario(jsonb, text, text, text) from public, anon;
revoke execute on function public.obter_documentos_usuario(text) from public, anon;
grant execute on function public.salvar_dados_usuario(jsonb, text, text, text) to authenticated;
grant execute on function public.obter_documentos_usuario(text) to authenticated;
revoke execute on function public.usuarios_protege_documentos() from public, anon, authenticated;

/* ---------- Acesso: anon não lê usuarios; authenticated lê a própria linha sem cpf/cnpj ---------- */
revoke all on usuarios from anon;
revoke select on usuarios from authenticated;
grant select (id, email, nome, whatsapp, documento, plano, status, criado_em, nome_empresa, rua, numero, municipio, estado,
              consentimento_lgpd_aceito_em, consentimento_lgpd_versao, politica_privacidade_aceita_em, politica_privacidade_versao)
  on usuarios to authenticated;
-- RLS (já existente): usuarios_proprio_select / usuarios_proprio_update → auth.uid() = id

-- FASE 7c: catálogo geral (todas as representadas em um PDF)
alter table documentos drop constraint documentos_tipo_check;
alter table documentos add constraint documentos_tipo_check check (tipo in ('relatorio_periodo','relatorio_comissao','catalogo','catalogo_geral'));

-- FASE 3d-1: representadas (endereco/contato) e pontos de faturamento
alter table representadas
  add column rua text,
  add column numero text,
  add column complemento text,
  add column cep text,
  add column municipio text,
  add column estado text check (estado in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  add column email text,
  add column telefone text;
-- comissão agora é por produto (Fase 5); o padrão da representada sai
alter table representadas drop column if exists comissao_padrao;

create table pontos_faturamento (
  id uuid primary key default gen_random_uuid(),
  representada_id uuid not null references representadas(id) on delete cascade,
  nome text not null,
  cnpj text,
  rua text,
  numero text,
  complemento text,
  cep text,
  municipio text,
  estado text check (estado in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  email text,
  telefone text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  criado_em timestamptz not null default now()
);
create index pontos_faturamento_representada_idx on pontos_faturamento (representada_id);
alter table pontos_faturamento enable row level security;
create policy pontos_faturamento_dono on pontos_faturamento for all to authenticated
  using (exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid())));

create index uploads_representada_tipo_idx on uploads (representada_id, tipo);

-- FASE 3d-2: NCM do produto (8 dígitos quando preenchido)
alter table produtos add column ncm text check (ncm is null or ncm ~ '^[0-9]{8}$');

-- FASE 3d-3: desconto percentual, forma e prazo de pagamento

-- desconto (R$) → desconto_percentual; dados existentes convertidos pelo valor bruto do item
alter table pedido_itens add column desconto_percentual numeric(5,2) not null default 0
  check (desconto_percentual between 0 and 100);
update pedido_itens
   set desconto_percentual = least(100, round(desconto / (quantidade * preco_unitario) * 100, 2))
 where desconto > 0 and quantidade * preco_unitario > 0;
alter table pedido_itens drop column desconto;

-- forma de pagamento padronizada (texto livre antigo vai para as observações, sem perda)
update pedidos
   set observacoes = concat_ws(' · ', observacoes, 'Pagamento: ' || forma_pagamento),
       forma_pagamento = 'outros'
 where forma_pagamento is not null
   and forma_pagamento not in ('dinheiro','credito','debito','bonificacao','pix','outros');
alter table pedidos
  add constraint pedidos_forma_pagamento_check
    check (forma_pagamento is null or forma_pagamento in ('dinheiro','credito','debito','bonificacao','pix','outros')),
  add column prazo_tipo text not null default 'a_vista' check (prazo_tipo in ('a_vista','a_prazo')),
  add column prazo_dias int check (prazo_dias is null or prazo_dias between 1 and 365),
  add constraint pedidos_prazo_check check ((prazo_tipo = 'a_prazo') = (prazo_dias is not null));

-- criar_pedido: itens com desconto_percentual (≤ desconto máximo da tabela); subtotal = q × p × (1 − d/100)
drop function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid);
create function public.criar_pedido(
  p_representada_id uuid, p_cliente_id uuid, p_itens jsonb,
  p_forma_pagamento text default null, p_confirmar boolean default false, p_id uuid default null,
  p_prazo_tipo text default 'a_vista', p_prazo_dias int default null
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

  insert into pedidos (id, user_id, representada_id, cliente_id, numero, status, forma_pagamento, prazo_tipo, prazo_dias, origem)
  values (
    coalesce(p_id, gen_random_uuid()), v_uid, p_representada_id, p_cliente_id,
    'P' || lpad(((select count(*) from pedidos where user_id = v_uid) + 1)::text, 6, '0'),
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
    if v_desc < 0 or v_desc > coalesce(v_desc_max, 0) then
      raise exception 'Desconto acima do máximo permitido (% %%) para %', coalesce(v_desc_max, 0), v_prod.nome;
    end if;

    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, subtotal, comissao_percentual)
    values (v_id, v_prod.id, v_prod.nome, v_qtd, v_preco, v_desc, round(v_qtd * v_preco * (1 - v_desc / 100), 2), v_prod.comissao);
  end loop;

  update pedidos set valor_total = (select sum(subtotal) from pedido_itens where pedido_id = v_id) where id = v_id;

  if p_confirmar then perform confirmar_pedido(v_id); end if;
  return v_id;
end $$;
revoke execute on function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid, text, int) from public, anon;
grant execute on function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid, text, int) to authenticated;

-- ===== 20261022100000_fase3d3_alerta_desconto.sql =====
-- FASE 3d-3 (ajuste): desconto acima do máximo não bloqueia o pedido; vira alerta no item
alter table pedido_itens add column desconto_acima_max boolean not null default false;

-- criar_pedido: desconto acima do máximo da tabela é aceito e marcado (alerta), não recusado
drop function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid, text, int);
create function public.criar_pedido(
  p_representada_id uuid, p_cliente_id uuid, p_itens jsonb,
  p_forma_pagamento text default null, p_confirmar boolean default false, p_id uuid default null,
  p_prazo_tipo text default 'a_vista', p_prazo_dias int default null
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

  insert into pedidos (id, user_id, representada_id, cliente_id, numero, status, forma_pagamento, prazo_tipo, prazo_dias, origem)
  values (
    coalesce(p_id, gen_random_uuid()), v_uid, p_representada_id, p_cliente_id,
    'P' || lpad(((select count(*) from pedidos where user_id = v_uid) + 1)::text, 6, '0'),
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
revoke execute on function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid, text, int) from public, anon;
grant execute on function public.criar_pedido(uuid, uuid, jsonb, text, boolean, uuid, text, int) to authenticated;

-- ===== 20261023090000_editar_pedido.sql =====
-- Edição de pedido (rascunho ou confirmado/entregue): regrava itens com preço, desconto e produtos informados.
-- Pedido confirmado/entregue: recalcula comissão dos itens, comissao_total e a linha em comissoes.
-- % de comissão: mantém o snapshot do item já existente; produto novo usa o % atual do produto.
-- Bloqueado: pedido cancelado ou com comissão já recebida.
create function public.editar_pedido(
  p_pedido_id uuid, p_itens jsonb,
  p_forma_pagamento text default null, p_prazo_tipo text default 'a_vista', p_prazo_dias int default null
) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_ped pedidos%rowtype;
  v_item jsonb;
  v_prod produtos%rowtype;
  v_antigos jsonb;
  v_preco numeric(12,2);
  v_desc_max numeric(5,2);
  v_qtd numeric(12,3);
  v_desc numeric(5,2);
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

  select coalesce(jsonb_object_agg(produto_id::text, comissao_percentual), '{}'::jsonb) into v_antigos
    from pedido_itens where pedido_id = p_pedido_id and produto_id is not null;
  delete from pedido_itens where pedido_id = p_pedido_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_prod from produtos
     where id = (v_item->>'produto_id')::uuid and representada_id = v_ped.representada_id;
    if not found then raise exception 'Produto não pertence à representada'; end if;
    -- produto inativado depois do pedido pode continuar nele, mas não entrar como novo
    if not v_prod.ativo and not (v_antigos ? v_prod.id::text) then raise exception 'Produto inativo: %', v_prod.nome; end if;

    v_qtd := (v_item->>'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida para %', v_prod.nome; end if;
    v_preco := (v_item->>'preco_unitario')::numeric;
    if v_preco is null or v_preco < 0 then raise exception 'Preço inválido para %', v_prod.nome; end if;
    v_desc := coalesce((v_item->>'desconto_percentual')::numeric, 0);
    if v_desc < 0 or v_desc > 100 then raise exception 'Desconto inválido para %', v_prod.nome; end if;

    v_desc_max := null;
    select tp.desconto_max into v_desc_max from tabelas_preco tp
     where tp.produto_id = v_prod.id and (tp.cliente_id = v_ped.cliente_id or tp.cliente_id is null)
     order by tp.cliente_id nulls last limit 1;

    v_pct := coalesce((v_antigos->>v_prod.id::text)::numeric, v_prod.comissao);
    v_sub := round(v_qtd * v_preco * (1 - v_desc / 100), 2);

    insert into pedido_itens (pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual,
                              desconto_acima_max, subtotal, comissao_percentual, comissao_valor)
    values (p_pedido_id, v_prod.id, v_prod.nome, v_qtd, v_preco, v_desc, v_desc > coalesce(v_desc_max, 0), v_sub, v_pct,
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
         prazo_dias = case when coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' then p_prazo_dias end
   where id = p_pedido_id;

  if v_confirmado then
    update comissoes
       set valor = v_com, percentual = case when v_total > 0 then round(v_com / v_total * 100, 2) else 0 end
     where pedido_id = p_pedido_id and status <> 'cancelada';
  end if;
end $$;
revoke execute on function public.editar_pedido(uuid, jsonb, text, text, int) from public, anon;
grant execute on function public.editar_pedido(uuid, jsonb, text, text, int) to authenticated;

-- ===== 20261024090000_fase4d_funis.sql =====
-- FASE 4d: funis de vendas (todas as mudanças de schema da fase 4d)

create table funis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 80),
  modelo text not null check (modelo in ('vendas', 'prospeccao', 'personalizado')),
  criado_em timestamptz not null default now()
);
create index funis_user_idx on funis (user_id, criado_em);

create table funil_etapas (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references funis(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  ordem int not null,
  e_fechamento boolean not null default false
);
create index funil_etapas_funil_idx on funil_etapas (funil_id, ordem);

alter table funis enable row level security;
alter table funil_etapas enable row level security;
create policy funis_dono on funis for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy funil_etapas_dono on funil_etapas for all to authenticated
  using (exists (select 1 from funis f where f.id = funil_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from funis f where f.id = funil_id and f.user_id = (select auth.uid())));

alter table oportunidades_desafios
  add column funil_id uuid references funis(id) on delete set null,
  add column etapa_id uuid references funil_etapas(id) on delete set null,
  add column arquivada boolean not null default false;
create index oportunidades_funil_idx on oportunidades_desafios (funil_id, etapa_id) where not arquivada;

-- Etapas padrão de cada modelo; 'Fechamento' nasce com e_fechamento = true.
create function public.etapas_do_modelo(p_modelo text) returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select case p_modelo
    when 'vendas' then array['Oportunidade Identificada', 'Proposta Enviada', 'Negociação', 'Fechamento']
    when 'prospeccao' then array['Prospecção', 'Contato Feito', 'Cadastro', 'Proposta Enviada', 'Negociação', 'Fechamento']
    when 'personalizado' then array['Definir Etapa', 'Definir Etapa', 'Definir Etapa', 'Definir Etapa']
  end;
$$;

-- Uso interno (migração e gatilho): cria funil + etapas para um usuário.
create function public.criar_funil_para(p_user_id uuid, p_nome text, p_modelo text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_etapas text[] := etapas_do_modelo(p_modelo);
begin
  if v_etapas is null then raise exception 'Modelo de funil inválido'; end if;
  insert into funis (user_id, nome, modelo) values (p_user_id, trim(p_nome), p_modelo) returning id into v_id;
  insert into funil_etapas (funil_id, nome, ordem, e_fechamento)
  select v_id, e.nome, e.ordem::int, e.nome = 'Fechamento'
    from unnest(v_etapas) with ordinality as e(nome, ordem);
  return v_id;
end $$;
revoke execute on function public.criar_funil_para(uuid, text, text) from public, anon, authenticated;

-- Pela aplicação: cria funil do usuário logado (definer só para chamar criar_funil_para; dono = auth.uid()).
create function public.criar_funil(p_nome text, p_modelo text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if p_nome is null or length(trim(p_nome)) = 0 then raise exception 'Informe o nome do funil'; end if;
  return criar_funil_para(auth.uid(), p_nome, p_modelo);
end $$;
revoke execute on function public.criar_funil(text, text) from public, anon;
grant execute on function public.criar_funil(text, text) to authenticated;

-- Toda oportunidade pertence a um funil: sem funil → primeiro funil do usuário (cria 'Vendas' se não houver);
-- sem etapa → 'Fechamento' quando concluída, senão a primeira etapa. Funil/etapa precisam ser do dono.
create function public.oportunidade_define_funil() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.funil_id is null then
    select id into new.funil_id from funis where user_id = new.user_id order by criado_em, id limit 1;
    if new.funil_id is null then new.funil_id := criar_funil_para(new.user_id, 'Vendas', 'vendas'); end if;
  elsif not exists (select 1 from funis where id = new.funil_id and user_id = new.user_id) then
    raise exception 'Funil inválido';
  end if;
  if new.etapa_id is not null and not exists (select 1 from funil_etapas where id = new.etapa_id and funil_id = new.funil_id) then
    raise exception 'Etapa não pertence ao funil';
  end if;
  if new.etapa_id is null then
    select id into new.etapa_id from funil_etapas
     where funil_id = new.funil_id
     order by (new.status = 'concluido' and e_fechamento) desc, ordem
     limit 1;
  end if;
  return new;
end $$;
-- roda depois de oportunidades_dono (ordem alfabética), que define user_id
create trigger oportunidades_funil before insert or update of funil_id, etapa_id on oportunidades_desafios
  for each row execute function public.oportunidade_define_funil();

-- MIGRAÇÃO DE DADOS: 1 funil 'Vendas' por usuário com oportunidades; concluídas → Fechamento, demais → 1ª etapa.
do $$
declare
  r record;
  v_funil uuid;
begin
  for r in select distinct user_id from oportunidades_desafios loop
    v_funil := criar_funil_para(r.user_id, 'Vendas', 'vendas');
    update oportunidades_desafios o
       set funil_id = v_funil,
           etapa_id = (select e.id from funil_etapas e where e.funil_id = v_funil
                        order by (o.status = 'concluido' and e.e_fechamento) desc, e.ordem limit 1)
     where o.user_id = r.user_id;
  end loop;
  if exists (select 1 from oportunidades_desafios where funil_id is null or etapa_id is null) then
    raise exception 'Migração incompleta: oportunidade sem funil/etapa';
  end if;
end $$;

-- ===== 20261025090000_fase10_tipos_relatorio.sql =====
-- FASE 10: novos tipos de relatório da Biblioteca (sem tabela nova; reusa documentos + hash_cache + quota pdf_mes)
alter table documentos drop constraint documentos_tipo_check;
alter table documentos add constraint documentos_tipo_check check (tipo in (
  'relatorio_periodo','relatorio_comissao','catalogo','catalogo_geral',
  'relatorio_vendas_geral','relatorio_vendas_cliente','relatorio_vendas_representada','relatorio_kpis'
));

-- ===== 20261026090000_fase11_despesas.sql =====
-- FASE 11: controle de custos (despesas com vínculo opcional a representadas e clientes)

create table despesas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  descricao text not null check (length(trim(descricao)) between 1 and 200),
  data date not null,
  valor numeric(12,2) not null check (valor >= 0),
  observacoes text,
  criado_em timestamptz not null default now()
);
create index despesas_user_data_idx on despesas (user_id, data);

create table despesa_representadas (
  despesa_id uuid not null references despesas(id) on delete cascade,
  representada_id uuid not null references representadas(id) on delete cascade,
  unique (despesa_id, representada_id)
);
create index despesa_representadas_rep_idx on despesa_representadas (representada_id);

create table despesa_clientes (
  despesa_id uuid not null references despesas(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  unique (despesa_id, cliente_id)
);
create index despesa_clientes_cli_idx on despesa_clientes (cliente_id);

alter table despesas enable row level security;
alter table despesa_representadas enable row level security;
alter table despesa_clientes enable row level security;

create policy despesas_dono on despesas for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- junções: a despesa precisa ser do usuário; e a representada/cliente vinculado também
create policy despesa_representadas_dono on despesa_representadas for all to authenticated
  using (exists (select 1 from despesas d where d.id = despesa_id and d.user_id = (select auth.uid())))
  with check (
    exists (select 1 from despesas d where d.id = despesa_id and d.user_id = (select auth.uid()))
    and exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid()))
  );
create policy despesa_clientes_dono on despesa_clientes for all to authenticated
  using (exists (select 1 from despesas d where d.id = despesa_id and d.user_id = (select auth.uid())))
  with check (
    exists (select 1 from despesas d where d.id = despesa_id and d.user_id = (select auth.uid()))
    and exists (select 1 from clientes c where c.id = cliente_id and c.user_id = (select auth.uid()))
  );

-- ===== 20261027090000_fase12_pdf_pedido.sql =====
-- FASE 12: PDF do pedido (documento operacional) — mesmo fluxo de documentos/hash_cache, sem consumir pdf_mes
alter table documentos drop constraint documentos_tipo_check;
alter table documentos add constraint documentos_tipo_check check (tipo in (
  'relatorio_periodo','relatorio_comissao','catalogo','catalogo_geral',
  'relatorio_vendas_geral','relatorio_vendas_cliente','relatorio_vendas_representada','relatorio_kpis',
  'pedido'
));

-- quota pdf_mes: só documentos que não são o PDF operacional do pedido
drop trigger quota_pdfs on documentos;
create trigger quota_pdfs before insert on documentos
  for each row when (new.tipo is distinct from 'pedido')
  execute function public.quota_trigger('pdf_mes', 'mensal');

-- ===== 20261028090000_produtos_ncm_preco_opcional.sql =====
-- Produtos: NCM opcional com 8 dígitos e preço opcional (preparação para importação de produtos).
-- Ajustado ao schema real: a coluna de preço chama "preco" (não existe "preco_padrao") e a chave
-- única é (representada_id, sku) — cada representada pertence a um único usuário.

-- ncm: text, aceita nulo (já criada na Fase 3d-2; idempotente)
alter table produtos add column if not exists ncm text;

-- preço deixa de ser obrigatório (o default 0 continua valendo quando omitido)
alter table produtos alter column preco drop not null;

-- ncm preenchido = exatamente 8 dígitos numéricos (recria a regra com nome explícito)
alter table produtos drop constraint if exists produtos_ncm_check;
alter table produtos add constraint produtos_ncm_check check (ncm is null or ncm ~ '^[0-9]{8}$');

-- chave única de SKU mantida: unique (representada_id, sku) — sem alteração

-- ===== 20261028100000_importacoes.sql =====
-- Importação de produtos por planilha: resumo de cada importação (commit)
create table importacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  representada_id uuid references representadas(id) on delete set null,
  tipo text not null default 'produtos' check (tipo in ('produtos')),
  arquivo text not null check (length(arquivo) between 1 and 255),
  total int not null check (total >= 0),
  validas int not null check (validas >= 0),
  inseridos int not null default 0 check (inseridos >= 0),
  atualizados int not null default 0 check (atualizados >= 0),
  com_erro int not null default 0 check (com_erro >= 0),
  erros jsonb not null default '[]',   -- até 200 erros (linha, campo, mensagem)
  criado_em timestamptz not null default now()
);
create index importacoes_user_idx on importacoes (user_id, criado_em desc);

alter table importacoes enable row level security;
create policy importacoes_dono on importacoes for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (representada_id is null or exists (select 1 from representadas r where r.id = representada_id and r.user_id = (select auth.uid())))
  );

-- ===== 20261029090000_analises_fase1.sql =====
-- ANÁLISES — Fase 1: fonte desnormalizada, índices e engine de pivot (whitelist fechada, RLS do usuário)

-- Fonte desnormalizada: 1 linha por item de pedido. security_invoker = as políticas RLS das tabelas
-- de origem valem para quem consulta (um representante nunca vê dados de outro).
create view analise_itens with (security_invoker = true) as
select
  i.id                                                   as item_id,
  p.id                                                   as pedido_id,
  p.numero,
  p.data,
  (p.data at time zone 'America/Sao_Paulo')::date       as data_dia,
  p.status,
  p.origem                                               as canal,
  p.representada_id,
  r.nome                                                 as representada_nome,
  p.cliente_id,
  c.nome                                                 as cliente_nome,
  c.uf,
  c.cidade,
  i.produto_id,
  coalesce(pr.nome, i.descricao)                         as produto_nome,
  pr.sku,
  pr.categoria,
  i.quantidade,
  round(i.quantidade * i.preco_unitario, 2)              as valor_bruto,
  round(i.quantidade * i.preco_unitario, 2) - i.subtotal as valor_desconto,
  i.subtotal                                             as valor_liquido
from pedido_itens i
join pedidos p on p.id = i.pedido_id
join representadas r on r.id = p.representada_id
left join clientes c on c.id = p.cliente_id
left join produtos pr on pr.id = i.produto_id;

-- Índices compostos (data fica no cabeçalho do pedido; o item liga produto ao pedido)
create index if not exists pedidos_representada_data_idx on pedidos (representada_id, data);
create index if not exists pedidos_cliente_data_idx on pedidos (cliente_id, data);
create index if not exists pedido_itens_produto_pedido_idx on pedido_itens (produto_id, pedido_id);

/*
  Engine de pivot. Recebe a AnaliseSpec (jsonb) e devolve o ResultadoAgregado (jsonb) numa ÚNICA consulta:
  - dimensões e métricas só pelas chaves da whitelist abaixo (expressões fixas; chave fora dela = erro);
  - valores do cliente (datas, ids, status, UF, canal) só como parâmetros ($1..$n), nunca concatenados;
  - GROUPING SETS ((dimensões), ()) devolve a linha de TOTAIS na mesma consulta: métricas não aditivas
    (ticket médio, preço médio, share…) são recalculadas no total, nunca somadas das linhas;
  - o período anterior equivalente vem na mesma varredura (FILTER), para variações sem dobrar o custo.
  security invoker: roda com as permissões (RLS) de quem chama.
*/
create function public.analise_pivot(p_spec jsonb) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_dims text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'dimensoes', '[]')));
  v_mets text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'metricas', '[]')));
  v_de date := (p_spec->'periodo'->>'de')::date;
  v_ate date := (p_spec->'periodo'->>'ate')::date;
  v_ant_de date;
  v_ant_ate date;
  v_limite int := least(greatest(coalesce((p_spec->>'limite')::int, 15), 1), 500);
  v_status text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'status', '[]')));
  v_reps uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'representada_id', '[]')) x);
  v_clis uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'cliente_id', '[]')) x);
  v_prods uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'produto_id', '[]')) x);
  v_ufs text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'uf', '[]')));
  v_canais text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'canal', '[]')));
  v_ord_campo text := coalesce(p_spec->'tabela'->'ordenacao'->>'campo', 'valor_liquido');
  v_ord_dir text := case when p_spec->'tabela'->'ordenacao'->>'direcao' = 'asc' then 'asc' else 'desc' end;
  v_base_cols text := '';
  v_grupo text := '';
  v_met_cols text := '';
  v_obj_linha text := '';
  v_obj_total text := '';
  v_ordem text;
  v_id text;
  v_rot text;
  v_expr text;
  d text;
  m text;
  i int := 0;
  v_sql text;
  v_res jsonb;
begin
  if v_de is null or v_ate is null or v_ate < v_de or v_ate - v_de > 1830 then
    raise exception 'Período inválido';
  end if;
  if coalesce(array_length(v_dims, 1), 0) not between 1 and 4 then raise exception 'Escolha de 1 a 4 dimensões'; end if;
  if coalesce(array_length(v_mets, 1), 0) not between 1 and 14 then raise exception 'Escolha de 1 a 14 métricas'; end if;
  v_ant_ate := v_de - 1;
  v_ant_de := v_de - (v_ate - v_de + 1);
  -- sem filtro de status = vendas (confirmados e entregues)
  if coalesce(array_length(v_status, 1), 0) = 0 then v_status := array['confirmado', 'entregue']; end if;

  -- DIMENSÕES (whitelist): chave → (id, rótulo)
  foreach d in array v_dims loop
    case d
      when 'representada' then v_id := 'representada_id::text'; v_rot := 'representada_nome';
      when 'cliente'      then v_id := 'cliente_id::text';      v_rot := 'cliente_nome';
      when 'produto'      then v_id := 'produto_id::text';      v_rot := 'produto_nome';
      when 'pedido'       then v_id := 'pedido_id::text';       v_rot := 'numero';
      when 'tempo'        then v_id := 'to_char(data_dia, ''YYYY-MM'')'; v_rot := 'to_char(data_dia, ''YYYY-MM'')';
      when 'status'       then v_id := 'status';                v_rot := 'status';
      when 'uf'           then v_id := 'coalesce(uf, ''—'')';    v_rot := 'coalesce(uf, ''—'')';
      when 'cidade'       then v_id := 'coalesce(cidade, ''—'')'; v_rot := 'coalesce(cidade, ''—'')';
      when 'canal'        then v_id := 'canal';                 v_rot := 'canal';
      when 'categoria'    then v_id := 'coalesce(categoria, ''Sem categoria'')'; v_rot := 'coalesce(categoria, ''Sem categoria'')';
      else raise exception 'Dimensão fora do catálogo';
    end case;
    if d = any(v_dims[1:i]) then raise exception 'Dimensão repetida'; end if;
    v_base_cols := v_base_cols || format('%s as k%s, %s as r%s, ', v_id, i, v_rot, i);
    v_grupo := v_grupo || format('k%s, r%s, ', i, i);
    v_obj_linha := v_obj_linha || format('%L, r%s, %L, k%s, ', d, i, d || '__id', i);
    i := i + 1;
  end loop;
  v_grupo := rtrim(v_grupo, ', ');

  -- MÉTRICAS (whitelist): expressão sobre a base, para o período atual (a) e o anterior (p)
  foreach m in array v_mets loop
    if (select count(*) from unnest(v_mets) x where x = m) > 1 then raise exception 'Métrica repetida'; end if;
    v_expr := case m
      when 'valor_liquido'        then 'round(coalesce(sum(valor_liquido) filter (where %1$s), 0), 2)'
      when 'valor_bruto'          then 'round(coalesce(sum(valor_bruto) filter (where %1$s), 0), 2)'
      when 'valor_desconto'       then 'round(coalesce(sum(valor_desconto) filter (where %1$s), 0), 2)'
      when 'quantidade'           then 'coalesce(sum(quantidade) filter (where %1$s), 0)'
      when 'numero_pedidos'       then 'count(distinct pedido_id) filter (where %1$s)'
      when 'ticket_medio'         then 'round(sum(valor_liquido) filter (where %1$s) / nullif(count(distinct pedido_id) filter (where %1$s), 0), 2)'
      when 'preco_medio'          then 'round(sum(valor_liquido) filter (where %1$s) / nullif(sum(quantidade) filter (where %1$s), 0), 2)'
      when 'itens_por_pedido'     then 'round(count(*) filter (where %1$s)::numeric / nullif(count(distinct pedido_id) filter (where %1$s), 0), 2)'
      when 'clientes_ativos'      then 'count(distinct cliente_id) filter (where %1$s)'
      when 'representadas_ativas' then 'count(distinct representada_id) filter (where %1$s)'
      when 'skus_ativos'          then 'count(distinct produto_id) filter (where %1$s)'
      when 'share'                then null  -- calculada sobre o total (abaixo)
      when 'variacao_percentual'  then null  -- atual × anterior (abaixo)
      else null
    end;
    if m not in ('valor_liquido','valor_bruto','valor_desconto','quantidade','numero_pedidos','ticket_medio','preco_medio',
                 'itens_por_pedido','clientes_ativos','representadas_ativas','skus_ativos','share','variacao_percentual') then
      raise exception 'Métrica fora do catálogo';
    end if;
    if v_expr is not null then
      v_met_cols := v_met_cols || format(v_expr, 'atual') || format(' as %I, ', m) || format(v_expr, 'not atual') || format(' as %I, ', m || '__ant');
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, %L, %I, ', m, m, m || '__ant', m || '__ant');
    else
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, ', m, m);
    end if;
  end loop;

  -- ordenação: só por chave de dimensão/métrica pedida (vira coluna conhecida); senão, valor líquido
  v_ordem := case
    when v_ord_campo = any(v_dims) then format('r%s', array_position(v_dims, v_ord_campo) - 1)
    when v_ord_campo = any(v_mets) then format('%I', v_ord_campo)
    else '__vl'
  end || ' ' || v_ord_dir || ' nulls last';

  v_sql := format($q$
    with base as (
      select %1$s data_dia >= $1 as atual, pedido_id, cliente_id, representada_id, produto_id, quantidade, valor_bruto, valor_desconto, valor_liquido
        from analise_itens
       where data_dia between $3 and $2
         and status = any($4)
         and (cardinality($5) = 0 or representada_id = any($5))
         and (cardinality($6) = 0 or cliente_id = any($6))
         and (cardinality($7) = 0 or produto_id = any($7))
         and (cardinality($8) = 0 or uf = any($8))
         and (cardinality($9) = 0 or canal = any($9))
    ),
    agg as (
      select %2$s, grouping(k0) as eh_total, %3$s
             round(coalesce(sum(valor_liquido) filter (where atual), 0), 2) as __vl,
             round(coalesce(sum(valor_liquido) filter (where not atual), 0), 2) as __vl_ant
        from base
       group by grouping sets ((%2$s), ())
    ),
    tot as (select * from agg where eh_total = 1),
    lin0 as (
      select a.*,
             round(a.__vl / nullif((select __vl from tot), 0) * 100, 1) as share,
             round((a.__vl - a.__vl_ant) / nullif(a.__vl_ant, 0) * 100, 1) as variacao_percentual
        from agg a where eh_total = 0 and (a.__vl <> 0 or a.__vl_ant <> 0)
    ),
    lin as (select l.*, row_number() over (order by %4$s) as __rn, count(*) over () as __n from lin0 l)
    select jsonb_build_object(
      'linhas', coalesce((select jsonb_agg(jsonb_build_object(%5$s) order by __rn) from lin where __rn <= %6$s), '[]'::jsonb),
      'totais', (select jsonb_build_object(%7$s '__vl', __vl, '__vl_ant', __vl_ant)
                   from (select t.*, case when t.__vl <> 0 then 100.0 end as share,
                                round((t.__vl - t.__vl_ant) / nullif(t.__vl_ant, 0) * 100, 1) as variacao_percentual from tot t) x),
      'totalLinhas', coalesce((select max(__n) from lin), 0),
      'agrupouOutros', false,
      'geradoEm', now()
    )
  $q$, v_base_cols, v_grupo, v_met_cols, v_ordem, rtrim(v_obj_linha, ', '), v_limite, v_obj_total);

  execute v_sql into v_res using v_de, v_ate, v_ant_de, v_status, v_reps, v_clis, v_prods, v_ufs, v_canais;
  return v_res;
end $$;
revoke execute on function public.analise_pivot(jsonb) from public, anon;
grant execute on function public.analise_pivot(jsonb) to authenticated;
-- ANÁLISES — Fase 2: engine estendida para as abas Por Cliente, Por Produto e Por Pedido.
-- Continua UMA consulta, whitelist fechada e security invoker (RLS do usuário).
-- Novidades:
--  - dimensão "dia" (data do pedido, para a aba Por Pedido);
--  - métricas de histórico de cliente: ultima_compra, dias_sem_comprar, clientes_novos, clientes_em_risco
--    (quando pedidas, a base inclui todo o histórico até a data final; o período continua só no FILTER);
--  - classe_abc (A até 80% acumulado, B até 95%, C restante) e concentracao (share do top 10) — calculadas
--    sobre todos os grupos (window), não sobre as linhas exibidas;
--  - pedidos_cancelados (conta cancelados mesmo com o filtro padrão de status);
--  - granularidade "pedidos": dimensões de item (produto, categoria) recusadas e o filtro de produto passa a
--    selecionar PEDIDOS que contêm o produto (valor do pedido inteiro).

create or replace function public.analise_pivot(p_spec jsonb) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_dims text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'dimensoes', '[]')));
  v_mets text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'metricas', '[]')));
  v_de date := (p_spec->'periodo'->>'de')::date;
  v_ate date := (p_spec->'periodo'->>'ate')::date;
  v_ant_de date;
  v_ant_ate date;
  v_gran text := case when p_spec->>'granularidade' = 'pedidos' then 'pedidos' else 'itens' end;
  v_limite int := least(greatest(coalesce((p_spec->>'limite')::int, 15), 1), 500);
  v_status text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'status', '[]')));
  v_reps uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'representada_id', '[]')) x);
  v_clis uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'cliente_id', '[]')) x);
  v_prods uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'produto_id', '[]')) x);
  v_ufs text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'uf', '[]')));
  v_canais text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'canal', '[]')));
  v_ord_campo text := coalesce(p_spec->'tabela'->'ordenacao'->>'campo', 'valor_liquido');
  v_ord_dir text := case when p_spec->'tabela'->'ordenacao'->>'direcao' = 'asc' then 'asc' else 'desc' end;
  v_hist boolean;
  v_filtro text;
  v_base_cols text := '';
  v_grupo text := '';
  v_met_cols text := '';
  v_obj_linha text := '';
  v_obj_total text := '';
  v_ordem text;
  v_id text;
  v_rot text;
  v_expr text;
  d text;
  m text;
  i int := 0;
  v_sql text;
  v_res jsonb;
begin
  if v_de is null or v_ate is null or v_ate < v_de or v_ate - v_de > 1830 then
    raise exception 'Período inválido';
  end if;
  if coalesce(array_length(v_dims, 1), 0) not between 1 and 6 then raise exception 'Escolha de 1 a 6 dimensões'; end if;
  if coalesce(array_length(v_mets, 1), 0) not between 1 and 20 then raise exception 'Escolha de 1 a 20 métricas'; end if;
  v_ant_ate := v_de - 1;
  v_ant_de := v_de - (v_ate - v_de + 1);
  -- sem filtro de status = vendas (confirmados e entregues)
  if coalesce(array_length(v_status, 1), 0) = 0 then v_status := array['confirmado', 'entregue']; end if;
  v_hist := v_mets && array['ultima_compra', 'dias_sem_comprar', 'clientes_novos', 'clientes_em_risco'];

  -- DIMENSÕES (whitelist): chave → (id, rótulo)
  foreach d in array v_dims loop
    case d
      when 'representada' then v_id := 'representada_id::text'; v_rot := 'representada_nome';
      when 'cliente'      then v_id := 'cliente_id::text';      v_rot := 'cliente_nome';
      when 'produto'      then v_id := 'produto_id::text';      v_rot := 'produto_nome';
      when 'pedido'       then v_id := 'pedido_id::text';       v_rot := 'numero';
      when 'tempo'        then v_id := 'to_char(data_dia, ''YYYY-MM'')'; v_rot := 'to_char(data_dia, ''YYYY-MM'')';
      when 'dia'          then v_id := 'to_char(data_dia, ''YYYY-MM-DD'')'; v_rot := 'to_char(data_dia, ''YYYY-MM-DD'')';
      when 'status'       then v_id := 'status';                v_rot := 'status';
      when 'uf'           then v_id := 'coalesce(uf, ''—'')';    v_rot := 'coalesce(uf, ''—'')';
      when 'cidade'       then v_id := 'coalesce(cidade, ''—'')'; v_rot := 'coalesce(cidade, ''—'')';
      when 'canal'        then v_id := 'canal';                 v_rot := 'canal';
      when 'categoria'    then v_id := 'coalesce(categoria, ''Sem categoria'')'; v_rot := 'coalesce(categoria, ''Sem categoria'')';
      else raise exception 'Dimensão fora do catálogo';
    end case;
    if d = any(v_dims[1:i]) then raise exception 'Dimensão repetida'; end if;
    if v_gran = 'pedidos' and d in ('produto', 'categoria') then
      raise exception 'Dimensão de item não disponível na granularidade Pedidos';
    end if;
    v_base_cols := v_base_cols || format('%s as k%s, %s as r%s, ', v_id, i, v_rot, i);
    v_grupo := v_grupo || format('k%s, r%s, ', i, i);
    v_obj_linha := v_obj_linha || format('%L, r%s, %L, k%s, ', d, i, d || '__id', i);
    i := i + 1;
  end loop;
  v_grupo := rtrim(v_grupo, ', ');

  -- MÉTRICAS (whitelist). %1$s = condição do período (per = 1 atual / per = 0 anterior); "incl" = status filtrado.
  foreach m in array v_mets loop
    if (select count(*) from unnest(v_mets) x where x = m) > 1 then raise exception 'Métrica repetida'; end if;
    v_expr := case m
      when 'valor_liquido'        then 'round(coalesce(sum(valor_liquido) filter (where %1$s and incl), 0), 2)'
      when 'valor_bruto'          then 'round(coalesce(sum(valor_bruto) filter (where %1$s and incl), 0), 2)'
      when 'valor_desconto'       then 'round(coalesce(sum(valor_desconto) filter (where %1$s and incl), 0), 2)'
      when 'quantidade'           then 'coalesce(sum(quantidade) filter (where %1$s and incl), 0)'
      when 'numero_pedidos'       then 'count(distinct pedido_id) filter (where %1$s and incl)'
      when 'ticket_medio'         then 'round(sum(valor_liquido) filter (where %1$s and incl) / nullif(count(distinct pedido_id) filter (where %1$s and incl), 0), 2)'
      when 'preco_medio'          then 'round(sum(valor_liquido) filter (where %1$s and incl) / nullif(sum(quantidade) filter (where %1$s and incl), 0), 2)'
      when 'itens_por_pedido'     then 'round(count(*) filter (where %1$s and incl)::numeric / nullif(count(distinct pedido_id) filter (where %1$s and incl), 0), 2)'
      when 'clientes_ativos'      then 'count(distinct cliente_id) filter (where %1$s and incl)'
      when 'representadas_ativas' then 'count(distinct representada_id) filter (where %1$s and incl)'
      when 'skus_ativos'          then 'count(distinct produto_id) filter (where %1$s and incl)'
      when 'pedidos_cancelados'   then 'count(distinct pedido_id) filter (where %1$s and status = ''cancelado'')'
      else null
    end;
    if m in ('clientes_novos', 'clientes_em_risco') then
      -- atual: situação na data final; anterior: situação na data final do período anterior
      v_met_cols := v_met_cols || case m
        when 'clientes_novos' then 'count(distinct cliente_id) filter (where incl and prim between $1 and $2) as clientes_novos, '
          || 'count(distinct cliente_id) filter (where incl and data_dia <= $10 and prim between $3 and $10) as clientes_novos__ant, '
        else 'count(distinct cliente_id) filter (where incl and ult < $2 - 90) as clientes_em_risco, '
          || 'count(distinct cliente_id) filter (where incl and data_dia <= $10 and ult_ant < $10 - 90) as clientes_em_risco__ant, ' end;
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, %L, %I, ', m, m, m || '__ant', m || '__ant');
    elsif m in ('ultima_compra', 'dias_sem_comprar') then
      v_met_cols := v_met_cols || case m
        when 'ultima_compra'    then 'max(data_dia) filter (where incl) as ultima_compra, '
        else '($2 - max(data_dia) filter (where incl)) as dias_sem_comprar, ' end;
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, null, ', m);
    elsif v_expr is not null then
      v_met_cols := v_met_cols || format(v_expr, 'per = 1') || format(' as %I, ', m) || format(v_expr, 'per = 0') || format(' as %I, ', m || '__ant');
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, %L, %I, ', m, m, m || '__ant', m || '__ant');
    elsif m in ('share', 'variacao_percentual', 'classe_abc') then
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, ', m, m);
    elsif m = 'concentracao' then
      v_obj_linha := v_obj_linha || '''concentracao'', null, ';
      v_obj_total := v_obj_total || '''concentracao'', concentracao, ''concentracao__ant'', concentracao__ant, ';
    else
      raise exception 'Métrica fora do catálogo';
    end if;
  end loop;

  -- filtros (valores só por parâmetro). Granularidade pedidos: produto seleciona o PEDIDO inteiro.
  v_filtro := '(cardinality($5) = 0 or representada_id = any($5))
         and (cardinality($6) = 0 or cliente_id = any($6))
         and (cardinality($8) = 0 or uf = any($8))
         and (cardinality($9) = 0 or canal = any($9))
         and (cardinality($7) = 0 or '
    || case when v_gran = 'pedidos' then 'pedido_id in (select x.pedido_id from analise_itens x where x.produto_id = any($7)))'
            else 'produto_id = any($7))' end;

  -- ordenação: só por chave de dimensão/métrica pedida (coluna conhecida); senão, valor líquido
  v_ordem := case
    when v_ord_campo = any(v_dims) then format('r%s', array_position(v_dims, v_ord_campo) - 1)
    when v_ord_campo = any(v_mets) and v_ord_campo <> 'concentracao' then format('%I', v_ord_campo)
    else '__vl'
  end || ' ' || v_ord_dir || ' nulls last';

  v_sql := format($q$
    with cli as (
      select cliente_id, min(data_dia) as prim, max(data_dia) as ult, max(data_dia) filter (where data_dia <= $10) as ult_ant
        from analise_itens
       where %8$s and data_dia <= $2 and status = any($4) and %9$s
       group by cliente_id
    ),
    base as (
      select %1$s
             case when data_dia >= $1 then 1 when data_dia >= $3 then 0 end as per,
             status = any($4) as incl, data_dia, status, pedido_id, cliente_id, representada_id, produto_id,
             quantidade, valor_bruto, valor_desconto, valor_liquido, c.prim, c.ult, c.ult_ant
        from (select * from analise_itens where data_dia <= $2 and (%8$s or data_dia >= $3) and %9$s) b
        left join cli c using (cliente_id)
    ),
    agg as (
      select %2$s, grouping(k0) as eh_total, %3$s
             round(coalesce(sum(valor_liquido) filter (where per = 1 and incl), 0), 2) as __vl,
             round(coalesce(sum(valor_liquido) filter (where per = 0 and incl), 0), 2) as __vl_ant,
             bool_or(incl) as __tem
        from base
       group by grouping sets ((%2$s), ())
    ),
    tot as (select * from agg where eh_total = 1),
    lin0 as (
      select a.*,
             round(a.__vl / nullif((select __vl from tot), 0) * 100, 1) as share,
             round((a.__vl - a.__vl_ant) / nullif(a.__vl_ant, 0) * 100, 1) as variacao_percentual,
             case when a.__vl <= 0 then 'C'
                  when coalesce(sum(a.__vl) over w, 0) < 0.80 * (select __vl from tot) then 'A'
                  when coalesce(sum(a.__vl) over w, 0) < 0.95 * (select __vl from tot) then 'B'
                  else 'C' end as classe_abc
        from agg a
       where eh_total = 0 and (a.__vl <> 0 or a.__vl_ant <> 0 or (%8$s and a.__tem))
      window w as (order by a.__vl desc, k0 rows between unbounded preceding and 1 preceding)
    ),
    lin as (select l.*, row_number() over (order by %4$s, k0) as __rn, count(*) over () as __n from lin0 l)
    select jsonb_build_object(
      'linhas', coalesce((select jsonb_agg(jsonb_build_object(%5$s) order by __rn) from lin where __rn <= %6$s), '[]'::jsonb),
      'totais', (select jsonb_build_object(%7$s '__vl', __vl, '__vl_ant', __vl_ant)
                   from (select t.*, case when t.__vl <> 0 then 100.0 end as share, null::text as classe_abc,
                                round((t.__vl - t.__vl_ant) / nullif(t.__vl_ant, 0) * 100, 1) as variacao_percentual,
                                (select round(sum(x.__vl) / nullif(t.__vl, 0) * 100, 1) from (select __vl from lin0 order by __vl desc limit 10) x) as concentracao,
                                (select round(sum(x.__vl_ant) / nullif(t.__vl_ant, 0) * 100, 1) from (select __vl_ant from lin0 order by __vl_ant desc limit 10) x) as concentracao__ant
                           from tot t) x),
      'totalLinhas', coalesce((select max(__n) from lin), 0),
      'agrupouOutros', false,
      'geradoEm', now()
    )
  $q$, v_base_cols, v_grupo, v_met_cols, v_ordem, rtrim(v_obj_linha, ', '), v_limite, v_obj_total,
       case when v_hist then 'true' else 'false' end, v_filtro);

  execute v_sql into v_res using v_de, v_ate, v_ant_de, v_status, v_reps, v_clis, v_prods, v_ufs, v_canais, v_ant_ate;
  return v_res;
end $$;
revoke execute on function public.analise_pivot(jsonb) from public, anon;
grant execute on function public.analise_pivot(jsonb) to authenticated;
-- FASE 13 — Cadastro de Devoluções (subpágina do cliente).
-- Mesma estrutura de itens do pedido; numeração própria 'DV' + 6 dígitos por usuário.
-- Gravação atômica pela função salvar_devolucao (subtotais e total calculados no banco).

create table devolucoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references usuarios(id) on delete cascade,
  numero text not null,
  cliente_id uuid not null references clientes(id) on delete cascade,
  representada_id uuid not null references representadas(id),
  pedido_id uuid references pedidos(id) on delete set null,
  data date not null,
  motivo text not null check (motivo in ('produto_avariado','produto_incorreto','desistencia','prazo_entrega','outro')),
  status text not null default 'pendente' check (status in ('pendente','aprovada','recusada','concluida')),
  forma_pagamento text check (forma_pagamento is null or forma_pagamento in ('dinheiro','credito','debito','bonificacao','pix','outros')),
  prazo_tipo text not null default 'a_vista' check (prazo_tipo in ('a_vista','a_prazo')),
  prazo_dias int check (prazo_dias is null or prazo_dias between 1 and 365),
  observacoes text,
  valor_total numeric(12,2) not null default 0,
  criado_em timestamptz not null default now()
);
create unique index devolucoes_user_numero_key on devolucoes (user_id, numero);

create table devolucao_itens (
  id uuid primary key default gen_random_uuid(),
  devolucao_id uuid not null references devolucoes(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  quantidade numeric(12,3) not null check (quantidade > 0),
  preco_unitario numeric(12,2) not null default 0 check (preco_unitario >= 0),
  desconto_percentual numeric(5,2) not null default 0 check (desconto_percentual between 0 and 100),
  subtotal numeric(12,2) not null default 0
);

create index devolucoes_user_data_idx on devolucoes (user_id, data);
create index devolucoes_cliente_idx on devolucoes (cliente_id);
create index devolucoes_representada_idx on devolucoes (representada_id);
create index devolucao_itens_devolucao_idx on devolucao_itens (devolucao_id);
create index devolucao_itens_produto_idx on devolucao_itens (produto_id);

alter table devolucoes enable row level security;
alter table devolucao_itens enable row level security;
create policy devolucoes_dono on devolucoes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy devolucao_itens_dono on devolucao_itens for all to authenticated
  using (exists (select 1 from devolucoes d where d.id = devolucao_id and d.user_id = (select auth.uid())))
  with check (exists (select 1 from devolucoes d where d.id = devolucao_id and d.user_id = (select auth.uid())));

/*
  Cria (p_id null) ou edita a devolução e regrava os itens.
  - representada, cliente, pedido e produtos passam pelo RLS (security invoker);
  - pedido de origem: precisa ser do mesmo cliente e representada; cada produto devolvido precisa estar no
    pedido, e a quantidade devolvida (somando as outras devoluções não recusadas do mesmo pedido) não pode
    passar da quantidade vendida;
  - subtotal = quantidade × preço × (1 − desconto%); valor_total = soma dos subtotais.
*/
create function public.salvar_devolucao(
  p_id uuid, p_cliente_id uuid, p_representada_id uuid, p_pedido_id uuid, p_data date,
  p_motivo text, p_status text, p_forma_pagamento text, p_prazo_tipo text, p_prazo_dias int,
  p_observacoes text, p_itens jsonb
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
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um item';
  end if;
  if coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' and coalesce(p_prazo_dias, 0) < 1 then
    raise exception 'Informe o prazo em dias';
  end if;
  if p_pedido_id is not null and not exists (
    select 1 from pedidos where id = p_pedido_id and cliente_id = p_cliente_id and representada_id = p_representada_id
  ) then
    raise exception 'Pedido de origem não pertence a este cliente e representada';
  end if;

  if v_id is null then
    insert into devolucoes (user_id, numero, cliente_id, representada_id, pedido_id, data, motivo, status,
                            forma_pagamento, prazo_tipo, prazo_dias, observacoes)
    values (
      v_uid,
      'DV' || lpad((coalesce((select max(substring(numero from 3)::int) from devolucoes where user_id = v_uid and numero ~ '^DV[0-9]+$'), 0) + 1)::text, 6, '0'),
      p_cliente_id, p_representada_id, p_pedido_id, p_data, p_motivo, coalesce(p_status, 'pendente'),
      nullif(trim(p_forma_pagamento), ''), coalesce(p_prazo_tipo, 'a_vista'),
      case when coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' then p_prazo_dias end, nullif(trim(p_observacoes), '')
    ) returning id into v_id;
  else
    update devolucoes set
      cliente_id = p_cliente_id, representada_id = p_representada_id, pedido_id = p_pedido_id, data = p_data,
      motivo = p_motivo, status = coalesce(p_status, 'pendente'), forma_pagamento = nullif(trim(p_forma_pagamento), ''),
      prazo_tipo = coalesce(p_prazo_tipo, 'a_vista'),
      prazo_dias = case when coalesce(p_prazo_tipo, 'a_vista') = 'a_prazo' then p_prazo_dias end,
      observacoes = nullif(trim(p_observacoes), '')
    where id = v_id;
    if not found then raise exception 'Devolução não encontrada'; end if;
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
  return v_id;
end $$;
revoke execute on function public.salvar_devolucao(uuid, uuid, uuid, uuid, date, text, text, text, text, int, text, jsonb) from public, anon;
grant execute on function public.salvar_devolucao(uuid, uuid, uuid, uuid, date, text, text, text, text, int, text, jsonb) to authenticated;
-- ANÁLISES — Fase 3: Análise de Mix + % devoluções.
-- Continua UMA chamada / UMA consulta, whitelist fechada, valores só por parâmetro e security invoker (RLS).
-- Novidades na engine:
--  - fonte analise_devolucoes (itens de devoluções não recusadas, mesmas colunas de analise_itens);
--  - métricas valor_devolvido e percentual_devolucoes (devolvido ÷ vendido no mesmo recorte e período);
--  - share_anterior, variacao_share (p.p.), lider_representada (texto), marcas_por_cliente;
--  - totais: concentracao_top5 e variacao_mix (índice de mudança de composição, em p.p.);
--  - spec.matriz {linha, coluna}: cruzamento (ex.: representada × categoria) devolvido na mesma consulta;
--  - dimensões resolvidas por analise_dim (whitelist única para dimensões e matriz).

create view analise_devolucoes with (security_invoker = true) as
select
  di.id                                                  as item_id,
  d.pedido_id,
  coalesce(p.numero, d.numero)                           as numero,
  d.data                                                 as data_dia,
  d.status,
  p.origem                                               as canal,
  d.representada_id,
  r.nome                                                 as representada_nome,
  d.cliente_id,
  c.nome                                                 as cliente_nome,
  c.uf,
  c.cidade,
  di.produto_id,
  pr.nome                                                as produto_nome,
  pr.categoria,
  di.quantidade,
  di.subtotal                                            as valor_liquido
from devolucao_itens di
join devolucoes d on d.id = di.devolucao_id
join representadas r on r.id = d.representada_id
left join clientes c on c.id = d.cliente_id
left join produtos pr on pr.id = di.produto_id
left join pedidos p on p.id = d.pedido_id
where d.status <> 'recusada';

-- Whitelist de dimensões: chave → {expressão do id, expressão do rótulo} sobre analise_itens/analise_devolucoes.
create function public.analise_dim(p_dim text) returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select case p_dim
    when 'representada' then array['representada_id::text', 'representada_nome']
    when 'cliente'      then array['cliente_id::text', 'cliente_nome']
    when 'produto'      then array['produto_id::text', 'produto_nome']
    when 'pedido'       then array['pedido_id::text', 'numero']
    when 'tempo'        then array['to_char(data_dia, ''YYYY-MM'')', 'to_char(data_dia, ''YYYY-MM'')']
    when 'dia'          then array['to_char(data_dia, ''YYYY-MM-DD'')', 'to_char(data_dia, ''YYYY-MM-DD'')']
    when 'status'       then array['status', 'status']
    when 'uf'           then array['coalesce(uf, ''—'')', 'coalesce(uf, ''—'')']
    when 'cidade'       then array['coalesce(cidade, ''—'')', 'coalesce(cidade, ''—'')']
    when 'canal'        then array['canal', 'canal']
    when 'categoria'    then array['coalesce(categoria, ''Sem categoria'')', 'coalesce(categoria, ''Sem categoria'')']
  end
$$;

create or replace function public.analise_pivot(p_spec jsonb) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  v_dims text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'dimensoes', '[]')));
  v_mets text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'metricas', '[]')));
  v_de date := (p_spec->'periodo'->>'de')::date;
  v_ate date := (p_spec->'periodo'->>'ate')::date;
  v_ant_de date;
  v_ant_ate date;
  v_gran text := case when p_spec->>'granularidade' = 'pedidos' then 'pedidos' else 'itens' end;
  v_limite int := least(greatest(coalesce((p_spec->>'limite')::int, 15), 1), 500);
  v_status text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'status', '[]')));
  v_reps uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'representada_id', '[]')) x);
  v_clis uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'cliente_id', '[]')) x);
  v_prods uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_spec->'filtros'->'produto_id', '[]')) x);
  v_ufs text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'uf', '[]')));
  v_canais text[] := array(select jsonb_array_elements_text(coalesce(p_spec->'filtros'->'canal', '[]')));
  v_ord_campo text := coalesce(p_spec->'tabela'->'ordenacao'->>'campo', 'valor_liquido');
  v_ord_dir text := case when p_spec->'tabela'->'ordenacao'->>'direcao' = 'asc' then 'asc' else 'desc' end;
  v_mtz_l text := p_spec->'matriz'->>'linha';
  v_mtz_c text := p_spec->'matriz'->>'coluna';
  v_hist boolean;
  v_dev boolean;
  v_lider boolean;
  v_mtz boolean := false;
  v_filtro text;
  v_base_cols text := '';
  v_dev_cols text := '';
  v_grupo text := '';
  v_join_dev text := '';
  v_join_lid text := '';
  v_met_cols text := '';
  v_obj_linha text := '';
  v_obj_total text := '';
  v_ordem text;
  v_par text[];
  v_par2 text[];
  d text;
  m text;
  v_expr text;
  i int := 0;
  v_sql text;
  v_res jsonb;
begin
  if v_de is null or v_ate is null or v_ate < v_de or v_ate - v_de > 1830 then
    raise exception 'Período inválido';
  end if;
  if coalesce(array_length(v_dims, 1), 0) not between 1 and 6 then raise exception 'Escolha de 1 a 6 dimensões'; end if;
  if coalesce(array_length(v_mets, 1), 0) not between 1 and 24 then raise exception 'Escolha de 1 a 24 métricas'; end if;
  v_ant_ate := v_de - 1;
  v_ant_de := v_de - (v_ate - v_de + 1);
  -- sem filtro de status = vendas (confirmados e entregues)
  if coalesce(array_length(v_status, 1), 0) = 0 then v_status := array['confirmado', 'entregue']; end if;
  v_hist := v_mets && array['ultima_compra', 'dias_sem_comprar', 'clientes_novos', 'clientes_em_risco'];
  v_dev := v_mets && array['valor_devolvido', 'percentual_devolucoes'];
  v_lider := 'lider_representada' = any(v_mets);

  -- DIMENSÕES (whitelist via analise_dim)
  foreach d in array v_dims loop
    v_par := analise_dim(d);
    if v_par is null then raise exception 'Dimensão fora do catálogo'; end if;
    if d = any(v_dims[1:i]) then raise exception 'Dimensão repetida'; end if;
    if v_gran = 'pedidos' and d in ('produto', 'categoria') then
      raise exception 'Dimensão de item não disponível na granularidade Pedidos';
    end if;
    v_base_cols := v_base_cols || format('%s as k%s, %s as r%s, ', v_par[1], i, v_par[2], i);
    v_grupo := v_grupo || format('k%s, r%s, ', i, i);
    v_join_dev := v_join_dev || format('a.k%1$s is not distinct from d.k%1$s and ', i);
    v_join_lid := v_join_lid || format('a.k%1$s is not distinct from l.k%1$s and ', i);
    v_obj_linha := v_obj_linha || format('%L, r%s, %L, k%s, ', d, i, d || '__id', i);
    i := i + 1;
  end loop;
  v_grupo := rtrim(v_grupo, ', ');
  v_dev_cols := v_base_cols;

  -- MATRIZ (cruzamento opcional, mesma whitelist)
  if v_mtz_l is not null or v_mtz_c is not null then
    v_par := analise_dim(v_mtz_l);
    v_par2 := analise_dim(v_mtz_c);
    if v_par is null or v_par2 is null or v_mtz_l = v_mtz_c then raise exception 'Matriz fora do catálogo'; end if;
    if v_gran = 'pedidos' and (v_mtz_l in ('produto', 'categoria') or v_mtz_c in ('produto', 'categoria')) then
      raise exception 'Dimensão de item não disponível na granularidade Pedidos';
    end if;
    v_base_cols := v_base_cols || format('%s as m_l, %s as m_lr, %s as m_c, %s as m_cr, ', v_par[1], v_par[2], v_par2[1], v_par2[2]);
    v_mtz := true;
  else
    v_base_cols := v_base_cols || 'null::text as m_l, null::text as m_lr, null::text as m_c, null::text as m_cr, ';
  end if;

  -- MÉTRICAS (whitelist). %1$s = condição do período (per = 1 atual / per = 0 anterior); "incl" = status filtrado.
  foreach m in array v_mets loop
    if (select count(*) from unnest(v_mets) x where x = m) > 1 then raise exception 'Métrica repetida'; end if;
    v_expr := case m
      when 'valor_liquido'        then 'round(coalesce(sum(valor_liquido) filter (where %1$s and incl), 0), 2)'
      when 'valor_bruto'          then 'round(coalesce(sum(valor_bruto) filter (where %1$s and incl), 0), 2)'
      when 'valor_desconto'       then 'round(coalesce(sum(valor_desconto) filter (where %1$s and incl), 0), 2)'
      when 'quantidade'           then 'coalesce(sum(quantidade) filter (where %1$s and incl), 0)'
      when 'numero_pedidos'       then 'count(distinct pedido_id) filter (where %1$s and incl)'
      when 'ticket_medio'         then 'round(sum(valor_liquido) filter (where %1$s and incl) / nullif(count(distinct pedido_id) filter (where %1$s and incl), 0), 2)'
      when 'preco_medio'          then 'round(sum(valor_liquido) filter (where %1$s and incl) / nullif(sum(quantidade) filter (where %1$s and incl), 0), 2)'
      when 'itens_por_pedido'     then 'round(count(*) filter (where %1$s and incl)::numeric / nullif(count(distinct pedido_id) filter (where %1$s and incl), 0), 2)'
      when 'clientes_ativos'      then 'count(distinct cliente_id) filter (where %1$s and incl)'
      when 'representadas_ativas' then 'count(distinct representada_id) filter (where %1$s and incl)'
      when 'skus_ativos'          then 'count(distinct produto_id) filter (where %1$s and incl)'
      when 'pedidos_cancelados'   then 'count(distinct pedido_id) filter (where %1$s and status = ''cancelado'')'
      when 'marcas_por_cliente'   then 'round(count(distinct cliente_id::text || representada_id::text) filter (where %1$s and incl)::numeric / nullif(count(distinct cliente_id) filter (where %1$s and incl), 0), 2)'
      else null
    end;
    if m in ('clientes_novos', 'clientes_em_risco') then
      -- atual: situação na data final; anterior: situação na data final do período anterior
      v_met_cols := v_met_cols || case m
        when 'clientes_novos' then 'count(distinct cliente_id) filter (where incl and prim between $1 and $2) as clientes_novos, '
          || 'count(distinct cliente_id) filter (where incl and data_dia <= $10 and prim between $3 and $10) as clientes_novos__ant, '
        else 'count(distinct cliente_id) filter (where incl and ult < $2 - 90) as clientes_em_risco, '
          || 'count(distinct cliente_id) filter (where incl and data_dia <= $10 and ult_ant < $10 - 90) as clientes_em_risco__ant, ' end;
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, %L, %I, ', m, m, m || '__ant', m || '__ant');
    elsif m in ('ultima_compra', 'dias_sem_comprar') then
      v_met_cols := v_met_cols || case m
        when 'ultima_compra' then 'max(data_dia) filter (where incl) as ultima_compra, '
        else '($2 - max(data_dia) filter (where incl)) as dias_sem_comprar, ' end;
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, null, ', m);
    elsif v_expr is not null then
      v_met_cols := v_met_cols || format(v_expr, 'per = 1') || format(' as %I, ', m) || format(v_expr, 'per = 0') || format(' as %I, ', m || '__ant');
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, %L, %I, ', m, m, m || '__ant', m || '__ant');
    elsif m in ('valor_devolvido', 'percentual_devolucoes') then
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, %L, %I, ', m, m, m || '__ant', m || '__ant');
    elsif m in ('share', 'variacao_percentual', 'classe_abc', 'share_anterior', 'variacao_share', 'lider_representada') then
      v_obj_linha := v_obj_linha || format('%L, %I, ', m, m);
      v_obj_total := v_obj_total || format('%L, %I, ', m, m);
    elsif m in ('concentracao', 'concentracao_top5') then
      v_obj_linha := v_obj_linha || format('%L, null, ', m);
      v_obj_total := v_obj_total || format('%L, %I, %L, %I, ', m, m, m || '__ant', m || '__ant');
    elsif m = 'variacao_mix' then
      v_obj_linha := v_obj_linha || '''variacao_mix'', null, ';
      v_obj_total := v_obj_total || '''variacao_mix'', variacao_mix, ';
    else
      raise exception 'Métrica fora do catálogo';
    end if;
  end loop;

  -- filtros (valores só por parâmetro). Granularidade pedidos: produto seleciona o PEDIDO inteiro.
  v_filtro := '(cardinality($5) = 0 or representada_id = any($5))
         and (cardinality($6) = 0 or cliente_id = any($6))
         and (cardinality($8) = 0 or uf = any($8))
         and (cardinality($9) = 0 or canal = any($9))
         and (cardinality($7) = 0 or '
    || case when v_gran = 'pedidos' then 'pedido_id in (select x.pedido_id from analise_itens x where x.produto_id = any($7)))'
            else 'produto_id = any($7))' end;

  -- ordenação: só por chave de dimensão/métrica de linha pedida (coluna conhecida); senão, valor líquido
  v_ordem := case
    when v_ord_campo = any(v_dims) then format('r%s', array_position(v_dims, v_ord_campo) - 1)
    when v_ord_campo = any(v_mets) and v_ord_campo not in ('concentracao', 'concentracao_top5', 'variacao_mix') then format('%I', v_ord_campo)
    else '__vl'
  end || ' ' || v_ord_dir || ' nulls last';

  v_sql := format($q$
    with cli as (
      select cliente_id, min(data_dia) as prim, max(data_dia) as ult, max(data_dia) filter (where data_dia <= $10) as ult_ant
        from analise_itens
       where %8$s and data_dia <= $2 and status = any($4) and %9$s
       group by cliente_id
    ),
    base as (
      select %1$s
             case when data_dia >= $1 then 1 when data_dia >= $3 then 0 end as per,
             status = any($4) as incl, data_dia, status, pedido_id, cliente_id, representada_id, representada_nome, produto_id,
             quantidade, valor_bruto, valor_desconto, valor_liquido, c.prim, c.ult, c.ult_ant
        from (select * from analise_itens where data_dia <= $2 and (%8$s or data_dia >= $3) and %9$s) b
        left join cli c using (cliente_id)
    ),
    agg as (
      select %2$s, grouping(k0) as eh_total, %3$s
             round(coalesce(sum(valor_liquido) filter (where per = 1 and incl), 0), 2) as __vl,
             round(coalesce(sum(valor_liquido) filter (where per = 0 and incl), 0), 2) as __vl_ant,
             bool_or(incl) as __tem
        from base
       group by grouping sets ((%2$s), ())
    ),
    dev as (
      select %2$s, grouping(k0) as eh_total,
             round(coalesce(sum(valor_liquido) filter (where per = 1), 0), 2) as __dv,
             round(coalesce(sum(valor_liquido) filter (where per = 0), 0), 2) as __dv_ant
        from (select %10$s case when data_dia >= $1 then 1 else 0 end as per, valor_liquido
                from analise_devolucoes where %11$s and data_dia between $3 and $2 and %9$s) x
       group by grouping sets ((%2$s), ())
    ),
    agg2 as (
      select a.*,
             coalesce(d.__dv, 0) as valor_devolvido, coalesce(d.__dv_ant, 0) as valor_devolvido__ant,
             round(coalesce(d.__dv, 0) / nullif(a.__vl, 0) * 100, 1) as percentual_devolucoes,
             round(coalesce(d.__dv_ant, 0) / nullif(a.__vl_ant, 0) * 100, 1) as percentual_devolucoes__ant
        from agg a left join dev d on %12$s a.eh_total = d.eh_total
    ),
    tot as (select * from agg2 where eh_total = 1),
    lid as (
      select y.*, row_number() over (partition by %2$s order by y.__v desc, y.__rep) as __pos
        from (select %2$s, representada_nome as __rep, sum(valor_liquido) filter (where per = 1 and incl) as __v
                from base where %13$s group by %2$s, representada_nome) y
       where y.__v > 0
    ),
    lin0 as (
      select a.*, l.__rep as lider_representada,
             round(a.__vl / nullif((select __vl from tot), 0) * 100, 1) as share,
             round(a.__vl_ant / nullif((select __vl_ant from tot), 0) * 100, 1) as share_anterior,
             round((a.__vl / nullif((select __vl from tot), 0) - a.__vl_ant / nullif((select __vl_ant from tot), 0)) * 100, 1) as variacao_share,
             round((a.__vl - a.__vl_ant) / nullif(a.__vl_ant, 0) * 100, 1) as variacao_percentual,
             case when a.__vl <= 0 then 'C'
                  when coalesce(sum(a.__vl) over w, 0) < 0.80 * (select __vl from tot) then 'A'
                  when coalesce(sum(a.__vl) over w, 0) < 0.95 * (select __vl from tot) then 'B'
                  else 'C' end as classe_abc
        from agg2 a
        left join lid l on %14$s l.__pos = 1
       where a.eh_total = 0 and (a.__vl <> 0 or a.__vl_ant <> 0 or (%8$s and a.__tem))
      window w as (order by a.__vl desc, a.k0 rows between unbounded preceding and 1 preceding)
    ),
    lin as (select l.*, row_number() over (order by %4$s, k0) as __rn, count(*) over () as __n from lin0 l),
    mtz as (
      select m_l, m_lr, m_c, m_cr, round(sum(valor_liquido) filter (where per = 1 and incl), 2) as v
        from base where %15$s group by m_l, m_lr, m_c, m_cr
    )
    select jsonb_build_object(
      'linhas', coalesce((select jsonb_agg(jsonb_build_object(%5$s) order by __rn) from lin where __rn <= %6$s), '[]'::jsonb),
      'totais', (select jsonb_build_object(%7$s '__vl', __vl, '__vl_ant', __vl_ant)
                   from (select t.*, case when t.__vl <> 0 then 100.0 end as share, null::text as classe_abc,
                                case when t.__vl_ant <> 0 then 100.0 end as share_anterior, null::numeric as variacao_share,
                                null::text as lider_representada,
                                round((t.__vl - t.__vl_ant) / nullif(t.__vl_ant, 0) * 100, 1) as variacao_percentual,
                                (select round(sum(x.__vl) / nullif(t.__vl, 0) * 100, 1) from (select __vl from lin0 order by __vl desc limit 10) x) as concentracao,
                                (select round(sum(x.__vl_ant) / nullif(t.__vl_ant, 0) * 100, 1) from (select __vl_ant from lin0 order by __vl_ant desc limit 10) x) as concentracao__ant,
                                (select round(sum(x.__vl) / nullif(t.__vl, 0) * 100, 1) from (select __vl from lin0 order by __vl desc limit 5) x) as concentracao_top5,
                                (select round(sum(x.__vl_ant) / nullif(t.__vl_ant, 0) * 100, 1) from (select __vl_ant from lin0 order by __vl_ant desc limit 5) x) as concentracao_top5__ant,
                                case when t.__vl <> 0 and t.__vl_ant <> 0 then
                                  (select round(sum(abs(x.__vl / t.__vl - x.__vl_ant / t.__vl_ant)) * 50, 1) from lin0 x) end as variacao_mix
                           from tot t) x),
      'totalLinhas', coalesce((select max(__n) from lin), 0),
      'agrupouOutros', false,
      'matriz', case when %15$s then coalesce((select jsonb_agg(jsonb_build_object('linha', m_lr, 'linha__id', m_l, 'coluna', m_cr, 'coluna__id', m_c, 'valor', v)
                                                          order by m_lr, m_cr) from mtz where v > 0), '[]'::jsonb) end,
      'geradoEm', now()
    )
  $q$, v_base_cols, v_grupo, v_met_cols, v_ordem, rtrim(v_obj_linha, ', '), v_limite, v_obj_total,
       case when v_hist then 'true' else 'false' end, v_filtro,
       v_dev_cols, case when v_dev then 'true' else 'false' end, v_join_dev,
       case when v_lider then 'true' else 'false' end, v_join_lid,
       case when v_mtz then 'true' else 'false' end);

  execute v_sql into v_res using v_de, v_ate, v_ant_de, v_status, v_reps, v_clis, v_prods, v_ufs, v_canais, v_ant_ate;
  return v_res;
end $$;
revoke execute on function public.analise_pivot(jsonb) from public, anon;
grant execute on function public.analise_pivot(jsonb) to authenticated;
