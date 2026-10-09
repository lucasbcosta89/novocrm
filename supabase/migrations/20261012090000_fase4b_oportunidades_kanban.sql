-- FASE 4b: página global de oportunidades (kanban)

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
