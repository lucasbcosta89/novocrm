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
