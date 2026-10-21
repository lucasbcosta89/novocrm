-- FASE 3d-1: representadas (endereço/contato), pontos de faturamento; documentos via uploads (tipo 'documento_representada')
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
