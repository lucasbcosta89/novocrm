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
