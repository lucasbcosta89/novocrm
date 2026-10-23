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
