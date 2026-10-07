-- FASE 6: planos, quota (usage) e assinaturas Mercado Pago

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
