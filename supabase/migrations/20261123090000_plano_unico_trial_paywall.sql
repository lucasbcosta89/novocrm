-- PLANO ÚNICO + TRIAL DE 7 DIAS + PAYWALL (somente leitura) + PROTEÇÕES DE USO JUSTO.
-- Decisões do usuário: um plano só (mensal R$ 119,90; anual R$ 99,90/mês = R$ 1.198,80 cobrados por ano);
-- trial de 7 dias SEM cartão a partir do cadastro; ao fim do trial (ou da carência de 7 dias de uma assinatura
-- vencida) a conta fica SOMENTE LEITURA (vê e exporta os dados, não cria nem edita); sem limite de representadas,
-- clientes, oportunidades ou PDFs; proteções contra abuso/bots: PDFs por janela de tempo e WhatsApp com teto de
-- uso justo (1.500 conversas/mês). Nenhum dado de negócio é alterado ou apagado.

-- ---------- Plano único ----------
insert into planos (codigo, nome, preco, limites)
values ('plurima', 'Plurima', 119.90, '{"representadas": null, "clientes": null, "oportunidades": null, "pdf_mes": null, "conversas_mes": 1500}')
on conflict (codigo) do update set nome = excluded.nome, preco = excluded.preco, limites = excluded.limites;
update usuarios set plano = 'plurima' where plano <> 'plurima';
update assinaturas set plano = 'plurima', plano_anterior = case when plano_anterior is null then null else 'plurima' end;
alter table usuarios alter column plano set default 'plurima';
delete from planos where codigo <> 'plurima';

-- ciclo de cobrança da assinatura (o plano é um só)
alter table assinaturas add column ciclo text not null default 'mensal' constraint assinaturas_ciclo_check check (ciclo in ('mensal', 'anual'));
alter table assinaturas add column ciclo_anterior text constraint assinaturas_ciclo_anterior_check check (ciclo_anterior in ('mensal', 'anual'));

-- ---------- Trial de 7 dias (sem cartão), contado do cadastro ----------
alter table usuarios add column trial_fim timestamptz not null default (now() + interval '7 days');
-- contas já existentes: o trial começa agora (nunca tiveram o plano novo)
update usuarios set trial_fim = now() + interval '7 days';
grant select (trial_fim) on usuarios to authenticated;

-- ---------- Acesso: assinante | carencia | trial | leitura ----------
-- assinante: assinatura com período vigente · carencia: vencida há até 7 dias (pagamento pendente) ·
-- trial: dentro dos 7 dias do cadastro · leitura: nada disso (vê e exporta; não cria nem edita).
-- Sempre do usuário da sessão (sem parâmetro: ninguém consulta o acesso de outra conta).
create or replace function acesso_usuario()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (select 1 from assinaturas a where a.user_id = auth.uid() and a.status in ('active', 'paused', 'cancelled')
                   and a.periodo_fim is not null and a.periodo_fim > now()) then 'assinante'
    when exists (select 1 from assinaturas a where a.user_id = auth.uid() and a.status in ('active', 'paused', 'cancelled')
                   and a.periodo_fim is not null and a.periodo_fim + interval '7 days' > now()) then 'carencia'
    when (select u.trial_fim from usuarios u where u.id = auth.uid()) > now() then 'trial'
    else 'leitura'
  end
$$;
revoke execute on function acesso_usuario() from public, anon;
grant execute on function acesso_usuario() to authenticated;

-- Paywall NO BANCO (nunca só no front): em modo leitura, nenhuma escrita em tabela de negócio.
-- Statement-level (uma checagem por comando, não por linha). Sem sessão de usuário (webhooks, rotinas, catálogo
-- público via funções do servidor) passa. Leitura e exportação continuam livres.
create or replace function exigir_assinatura()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return null; end if;
  if coalesce(current_setting('plurima.acesso_ok', true), '') = auth.uid()::text then return null; end if;
  if acesso_usuario() = 'leitura' then
    raise exception 'Seu período de teste terminou. Assine a Plurima para voltar a criar e editar — seus dados continuam disponíveis para consulta e exportação.'
      using errcode = 'P0001', hint = 'ASSINATURA_NECESSARIA';
  end if;
  perform set_config('plurima.acesso_ok', auth.uid()::text, true);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'representadas', 'produtos', 'tabelas_preco', 'clientes', 'cliente_representada', 'pedidos', 'pedido_itens', 'comissoes',
    'comissoes_lotes', 'devolucoes', 'devolucao_itens', 'oportunidades_desafios', 'oportunidade_produtos', 'plano_acao', 'funis',
    'funil_etapas', 'visitas', 'tarefas', 'despesas', 'despesa_representadas', 'despesa_clientes', 'alertas_pedido',
    'pontos_faturamento', 'analise_visoes', 'importacoes', 'uploads', 'conversas_whatsapp', 'mensagens_whatsapp',
    'templates_whatsapp'
  ] loop
    execute format('create trigger exigir_assinatura before insert or update or delete on %I for each statement execute function exigir_assinatura()', t);
  end loop;
end $$;

-- ---------- Uso justo de PDFs (sem limite mensal; protege contra bots e geração em massa) ----------
-- Reaproveitar o cache (mesmo conteúdo) não cria documento novo e não conta. Por usuário:
-- até 3 gerando ao mesmo tempo, 15 em 10 minutos, 60 por hora e 300 por dia.
drop trigger if exists quota_pdfs on documentos;
create or replace function documentos_uso_justo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_10m int; v_1h int; v_1d int; v_gerando int;
begin
  select count(*) filter (where criado_em > now() - interval '10 minutes'),
         count(*) filter (where criado_em > now() - interval '1 hour'),
         count(*),
         count(*) filter (where status = 'gerando' and criado_em > now() - interval '15 minutes')
    into v_10m, v_1h, v_1d, v_gerando
    from documentos where user_id = new.user_id and criado_em > now() - interval '1 day';
  if v_gerando >= 3 then
    raise exception 'Você já tem 3 documentos sendo gerados. Aguarde terminarem para pedir outro.' using errcode = 'P0001', hint = 'LIMITE_USO';
  end if;
  if v_10m >= 15 or v_1h >= 60 or v_1d >= 300 then
    raise exception 'Muitos PDFs gerados em pouco tempo. Por segurança, aguarde alguns minutos e tente de novo.' using errcode = 'P0001', hint = 'LIMITE_USO';
  end if;
  return new;
end $$;
revoke execute on function documentos_uso_justo() from public, anon, authenticated;
create trigger documentos_uso_justo before insert on documentos for each row execute function documentos_uso_justo();
create index if not exists documentos_user_criado_idx on documentos (user_id, criado_em desc);

-- ---------- Pagamento: período conforme o ciclo (mensal = 1 mês; anual = 12 meses) ----------
create or replace function public.aplicar_pagamento_assinatura(
  p_payment_id text, p_preapproval_id text, p_external_reference text, p_valor numeric
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_a assinaturas%rowtype;
  v_ciclo text;
  v_cancelar text;
  v_resultado text;
  v_intervalo interval;
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
    -- pagamento da assinatura antiga (troca de ciclo em andamento): vale o ciclo antigo
    v_ciclo := coalesce(v_a.ciclo_anterior, v_a.ciclo);
  else
    v_ciclo := v_a.ciclo;
    v_cancelar := v_a.mp_preapproval_anterior;
    update assinaturas set mp_preapproval_anterior = null, plano_anterior = null, ciclo_anterior = null where id = v_a.id;
  end if;
  v_intervalo := case when v_ciclo = 'anual' then interval '12 months' else interval '1 month' end;

  if v_a.status <> 'active' or v_a.periodo_fim is null or v_a.periodo_fim < now() - interval '7 days' then
    update assinaturas set status = 'active', periodo_inicio = now(), periodo_fim = now() + v_intervalo where id = v_a.id;
    v_resultado := 'ativada';
  else
    update assinaturas set periodo_fim = greatest(periodo_fim, now()) + v_intervalo where id = v_a.id;
    v_resultado := 'estendida';
  end if;
  update usuarios set plano = 'plurima' where id = v_a.user_id;
  return jsonb_build_object('resultado', v_resultado, 'plano', 'plurima', 'ciclo', v_ciclo, 'cancelar_preapproval', v_cancelar);
end $$;
revoke execute on function public.aplicar_pagamento_assinatura(text, text, text, numeric) from public, anon, authenticated;

-- Carência: vencida há mais de 7 dias → assinatura expirada (o acesso cai para leitura; nada é apagado nem rebaixado)
create or replace function public.aplicar_carencia_assinaturas() returns integer
language sql security definer set search_path = public, pg_temp as $$
  with vencidas as (
    update assinaturas set status = 'expired'
     where status in ('active', 'paused', 'cancelled') and periodo_fim is not null
       and periodo_fim + interval '7 days' < now()
    returning 1
  ) select count(*)::int from vencidas;
$$;
