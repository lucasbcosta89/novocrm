-- Quatro formas de pagamento do plano único:
--   cartao_mensal  R$ 129,90/mês recorrente (preapproval; cancela quando quiser)
--   cartao_anual   R$ 1.318,80 em até 12x de R$ 109,90 (pagamento único parcelado; 12 meses)
--   pix_mensal     R$ 109,90 à vista (1 mês)
--   pix_anual      R$ 1.078,80 à vista (12 meses; R$ 89,90/mês)
update planos set preco = 129.90 where codigo = 'plurima';

alter table assinaturas add column forma text
  constraint assinaturas_forma_check check (forma in ('cartao_mensal', 'cartao_anual', 'pix_mensal', 'pix_anual'));
update assinaturas set forma = case when ciclo = 'anual' then 'cartao_anual' else 'cartao_mensal' end where mp_preapproval_id is not null;

-- Recorrente: o pagamento aprovado também marca a forma
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
    v_ciclo := coalesce(v_a.ciclo_anterior, v_a.ciclo);
  else
    v_ciclo := v_a.ciclo;
    v_cancelar := v_a.mp_preapproval_anterior;
    update assinaturas set mp_preapproval_anterior = null, plano_anterior = null, ciclo_anterior = null where id = v_a.id;
  end if;
  v_intervalo := case when v_ciclo = 'anual' then interval '12 months' else interval '1 month' end;

  if v_a.status <> 'active' or v_a.periodo_fim is null or v_a.periodo_fim < now() - interval '7 days' then
    update assinaturas set status = 'active', forma = 'cartao_mensal', periodo_inicio = now(), periodo_fim = now() + v_intervalo where id = v_a.id;
    v_resultado := 'ativada';
  else
    update assinaturas set forma = 'cartao_mensal', periodo_fim = greatest(periodo_fim, now()) + v_intervalo where id = v_a.id;
    v_resultado := 'estendida';
  end if;
  update usuarios set plano = 'plurima' where id = v_a.user_id;
  return jsonb_build_object('resultado', v_resultado, 'plano', 'plurima', 'ciclo', v_ciclo, 'cancelar_preapproval', v_cancelar);
end $$;
revoke execute on function public.aplicar_pagamento_assinatura(text, text, text, numeric) from public, anon, authenticated;

-- Avulso (Pix mensal/anual e cartão anual parcelado): pagamento único aprovado libera 1 ou 12 meses, somados ao
-- período vigente. Idempotente pela PK de assinatura_pagamentos. Se havia cartão mensal recorrente, devolve a
-- preapproval para ser cancelada no MP (o cliente não é cobrado em dobro).
create or replace function public.aplicar_pagamento_avulso(
  p_payment_id text, p_user_id uuid, p_forma text, p_valor numeric
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_a assinaturas%rowtype;
  v_meses int;
  v_minimo numeric;
  v_cancelar text;
  v_resultado text;
begin
  select case p_forma when 'cartao_anual' then 12 when 'pix_anual' then 12 when 'pix_mensal' then 1 end,
         case p_forma when 'cartao_anual' then 1318.80 when 'pix_anual' then 1078.80 when 'pix_mensal' then 109.90 end
    into v_meses, v_minimo;
  if v_meses is null then return jsonb_build_object('resultado', 'forma_invalida'); end if;
  if p_valor is null or p_valor < v_minimo then return jsonb_build_object('resultado', 'valor_divergente'); end if;
  if not exists (select 1 from usuarios where id = p_user_id) then return jsonb_build_object('resultado', 'usuario_nao_encontrado'); end if;

  insert into assinaturas (user_id, plano, status, external_reference)
  values (p_user_id, 'plurima', 'pending', 'user_' || p_user_id)
  on conflict (user_id) do nothing;
  select * into v_a from assinaturas where user_id = p_user_id for update;

  insert into assinatura_pagamentos (payment_id, assinatura_id, valor) values (p_payment_id, v_a.id, p_valor)
  on conflict (payment_id) do nothing;
  if not found then return jsonb_build_object('resultado', 'duplicado'); end if;

  if v_a.mp_preapproval_id is not null and v_a.status in ('active', 'pending', 'paused') then
    v_cancelar := v_a.mp_preapproval_id;
  end if;

  if v_a.status not in ('active', 'cancelled', 'paused') or v_a.periodo_fim is null or v_a.periodo_fim < now() - interval '7 days' then
    update assinaturas set periodo_inicio = now(), periodo_fim = now() + make_interval(months => v_meses) where id = v_a.id;
    v_resultado := 'ativada';
  else
    update assinaturas set periodo_fim = greatest(periodo_fim, now()) + make_interval(months => v_meses) where id = v_a.id;
    v_resultado := 'estendida';
  end if;
  update assinaturas
     set status = 'active', forma = p_forma, ciclo = case when v_meses = 12 then 'anual' else 'mensal' end,
         mp_preapproval_id = case when v_cancelar is null then mp_preapproval_id end,
         mp_preapproval_anterior = null, ciclo_anterior = null, plano_anterior = null
   where id = v_a.id;
  update usuarios set plano = 'plurima' where id = p_user_id;
  return jsonb_build_object('resultado', v_resultado, 'forma', p_forma, 'cancelar_preapproval', v_cancelar);
end $$;
revoke execute on function public.aplicar_pagamento_avulso(text, uuid, text, numeric) from public, anon, authenticated;

