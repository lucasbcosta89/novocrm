-- FASE 6b: cadastro pós-checkout, dados do usuário e LGPD
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
