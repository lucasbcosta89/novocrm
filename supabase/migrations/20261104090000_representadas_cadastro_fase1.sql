-- CADASTRO DE REPRESENTADAS — Fase 1: modelo de dados.
-- Decisões (confirmadas com o usuário): colunas renomeadas para os nomes da especificação; CNPJ e IE únicos
-- POR USUÁRIO; código REP-0001 sequencial POR USUÁRIO (contador próprio, nunca MAX+1, nunca reutilizado);
-- exclusão só lógica (excluido_em) e só a exclusão libera a vaga do plano (inativa continua contando).
-- Representadas antigas sem os novos obrigatórios continuam válidas; o formulário exige completar na edição
-- e o banco impede esvaziar um obrigatório já preenchido.

-- 1) nomes da especificação (views e funções que não citam as colunas por nome seguem funcionando)
alter table representadas rename column nome to razao_social;
alter table representadas rename column municipio to cidade;
alter table representadas rename column estado to uf;
alter table representadas rename column email to email_comercial;
alter table representadas rename column rua to endereco;

-- 2) campos novos
alter table representadas
  add column codigo_representada text,
  add column nome_fantasia text,
  add column inscricao_estadual text,
  add column contato_nome text,
  add column contato_telefone text,
  add column bairro text,
  add column comissao_percentual numeric(5,2) not null default 0,
  add column prazo_pagamento_dias int,
  add column tabela_preco text,
  add column observacoes text,
  add column atualizado_em timestamptz not null default now(),
  add column excluido_em timestamptz;

-- CNPJ, IE e telefones guardados sem máscara (o app normaliza; o banco garante o formato)
update representadas set cnpj = nullif(regexp_replace(cnpj, '\D', '', 'g'), '') where cnpj is not null;

-- 3) regras de formato (aceitam nulo nas linhas antigas; obrigatoriedade no trigger abaixo)
alter table representadas
  add constraint representadas_razao_social_check check (length(btrim(razao_social)) between 3 and 150),
  add constraint representadas_nome_fantasia_check check (nome_fantasia is null or length(nome_fantasia) <= 100),
  add constraint representadas_cnpj_check check (cnpj is null or (cnpj ~ '^[0-9]{14}$' and cnpj_valido(cnpj))),
  add constraint representadas_ie_check check (inscricao_estadual is null or inscricao_estadual ~ '^([0-9]{2,14}|ISENTO)$'),
  add constraint representadas_email_check check (email_comercial is null or (length(email_comercial) <= 254 and email_comercial ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add constraint representadas_telefone_check check (telefone is null or telefone ~ '^[0-9]{10,13}$'),
  add constraint representadas_contato_telefone_check check (contato_telefone is null or contato_telefone ~ '^[0-9]{10,13}$'),
  add constraint representadas_contato_nome_check check (contato_nome is null or length(contato_nome) <= 100),
  add constraint representadas_cep_check check (cep is null or cep ~ '^[0-9]{8}$'),
  add constraint representadas_endereco_check check (endereco is null or length(endereco) <= 150),
  add constraint representadas_numero_check check (numero is null or length(numero) <= 20),
  add constraint representadas_complemento_check check (complemento is null or length(complemento) <= 60),
  add constraint representadas_bairro_check check (bairro is null or length(bairro) <= 80),
  add constraint representadas_cidade_check check (cidade is null or length(btrim(cidade)) between 2 and 80),
  add constraint representadas_comissao_check check (comissao_percentual between 0 and 100),
  add constraint representadas_prazo_check check (prazo_pagamento_dias is null or prazo_pagamento_dias between 0 and 365),
  add constraint representadas_tabela_preco_check check (tabela_preco is null or length(tabela_preco) <= 60),
  add constraint representadas_observacoes_check check (observacoes is null or length(observacoes) <= 500),
  add constraint representadas_status_check check (status in ('ativa', 'inativa')),
  add constraint representadas_codigo_check check (codigo_representada is null or length(btrim(codigo_representada)) between 1 and 20);
-- (uf já tem a lista fechada das 27 UFs desde a Fase 3d-1)

-- 4) obrigatórios: exigidos em toda inserção; na edição, um obrigatório preenchido não pode ser esvaziado
create function public.representadas_obrigatorios() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.cnpj is null then raise exception 'Informe o CNPJ'; end if;
    if new.email_comercial is null then raise exception 'Informe o e-mail comercial'; end if;
    if new.cidade is null then raise exception 'Informe a cidade'; end if;
    if new.uf is null then raise exception 'Informe a UF'; end if;
  else
    if new.cnpj is null and old.cnpj is not null then raise exception 'Informe o CNPJ'; end if;
    if new.email_comercial is null and old.email_comercial is not null then raise exception 'Informe o e-mail comercial'; end if;
    if new.cidade is null and old.cidade is not null then raise exception 'Informe a cidade'; end if;
    if new.uf is null and old.uf is not null then raise exception 'Informe a UF'; end if;
    new.atualizado_em := now();
  end if;
  return new;
end $$;
create trigger representadas_obrigatorios before insert or update on representadas
  for each row execute function public.representadas_obrigatorios();

-- 5) código REP-0001 por usuário: contador próprio travado na gravação (sem MAX+1). Número usado nunca volta:
-- o código fica na linha mesmo após exclusão lógica e o gerador pula códigos já existentes (inclusive digitados).
create table contadores (
  user_id uuid not null references usuarios(id) on delete cascade,
  entidade text not null check (entidade in ('representadas')),
  ultimo bigint not null default 0 check (ultimo >= 0),
  primary key (user_id, entidade)
);
alter table contadores enable row level security;
create policy contadores_dono on contadores for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.representadas_codigo() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_n bigint;
begin
  new.codigo_representada := nullif(upper(btrim(new.codigo_representada)), '');
  if tg_op = 'UPDATE' then
    new.codigo_representada := coalesce(new.codigo_representada, old.codigo_representada); -- vazio não apaga
    return new;
  end if;
  if new.codigo_representada is not null then return new; end if;
  loop
    insert into contadores as c (user_id, entidade, ultimo) values (new.user_id, 'representadas', 1)
    on conflict (user_id, entidade) do update set ultimo = c.ultimo + 1
    returning ultimo into v_n;
    new.codigo_representada := 'REP-' || lpad(v_n::text, 4, '0');
    exit when not exists (select 1 from representadas
                           where user_id = new.user_id and codigo_representada = new.codigo_representada);
  end loop;
  return new;
end $$;
create trigger representadas_codigo before insert or update of codigo_representada on representadas
  for each row execute function public.representadas_codigo();

-- backfill: códigos das representadas existentes por ordem de criação; contador alinhado
with numeradas as (
  select id, user_id, row_number() over (partition by user_id order by criado_em, id) as n from representadas
)
update representadas r set codigo_representada = 'REP-' || lpad(x.n::text, 4, '0')
  from numeradas x where x.id = r.id;
insert into contadores (user_id, entidade, ultimo)
select user_id, 'representadas', count(*) from representadas group by user_id
on conflict (user_id, entidade) do update set ultimo = greatest(contadores.ultimo, excluded.ultimo);
alter table representadas alter column codigo_representada set not null;

-- 6) unicidade POR USUÁRIO. Código: inclui excluídas (nunca reutiliza). CNPJ/IE: só entre não excluídas
-- (excluir libera o CNPJ para um novo cadastro). IE "ISENTO" não entra na unicidade.
create unique index representadas_user_codigo_key on representadas (user_id, codigo_representada);
create unique index representadas_user_cnpj_key on representadas (user_id, cnpj)
  where cnpj is not null and excluido_em is null;
create unique index representadas_user_ie_key on representadas (user_id, inscricao_estadual)
  where inscricao_estadual is not null and inscricao_estadual <> 'ISENTO' and excluido_em is null;

-- 7) índices de busca/filtro (busca por prefixo/trecho em razão social e nome fantasia via trigram)
create extension if not exists pg_trgm with schema extensions;
create index representadas_razao_social_trgm on representadas using gin (lower(razao_social) extensions.gin_trgm_ops);
create index representadas_nome_fantasia_trgm on representadas using gin (lower(nome_fantasia) extensions.gin_trgm_ops);
create index representadas_user_status_uf_idx on representadas (user_id, status, uf) where excluido_em is null;
-- cnpj normalizado: coberto por representadas_user_cnpj_key (user_id, cnpj)

-- 8) exclusão SEMPRE lógica: sem policy de DELETE para o usuário (exclusão da conta continua em cascata).
drop policy representadas_dono on representadas;
create policy representadas_select on representadas for select to authenticated
  using ((select auth.uid()) = user_id);
create policy representadas_insert on representadas for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy representadas_update on representadas for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 9) quota: excluir (excluido_em preenchido) devolve a vaga; restaurar consome de novo. Delete físico
-- (cascata da conta) só devolve se a linha ainda não estava excluída. Inativa continua contando.
create or replace function public.quota_trigger() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_mensal boolean := tg_argv[1] = 'mensal';
begin
  if tg_op = 'INSERT' then
    perform consumir_quota(new.user_id, tg_argv[0], v_mensal);
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if (to_jsonb(old)->>'excluido_em') is null and (to_jsonb(new)->>'excluido_em') is not null then
      update usage set contador = greatest(contador - 1, 0)
       where user_id = old.user_id and recurso = tg_argv[0] and mes = 'total';
    elsif (to_jsonb(old)->>'excluido_em') is not null and (to_jsonb(new)->>'excluido_em') is null then
      perform consumir_quota(new.user_id, tg_argv[0], v_mensal);
    end if;
    return new;
  end if;
  if not v_mensal and (to_jsonb(old)->>'excluido_em') is null then
    update usage set contador = greatest(contador - 1, 0)
     where user_id = old.user_id and recurso = tg_argv[0] and mes = 'total';
  end if;
  return old;
end $$;
revoke execute on function public.quota_trigger() from public, anon, authenticated;
drop trigger quota_representadas on representadas;
create trigger quota_representadas before insert or delete or update of excluido_em on representadas
  for each row execute function public.quota_trigger('representadas', 'total');
