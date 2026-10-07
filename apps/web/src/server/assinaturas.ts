import "server-only";
import { z } from "zod";
import { envMp } from "@/lib/env";
import { ORDEM_PLANOS } from "@/lib/planos";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";
import { mp, type MpAuthorizedPayment, type MpPayment, type MpPreapproval } from "./mercadopago";

export type Assinatura = {
  plano: string;
  status: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
};

export const referenciaExterna = (userId: string) => `user_${userId}`;

export async function obterAssinatura({ supabase, userId }: Contexto): Promise<Assinatura | null> {
  const { data, error } = await supabase
    .from("assinaturas")
    .select("plano, status, periodo_inicio, periodo_fim")
    .eq("user_id", userId)
    .maybeSingle<Assinatura>();
  if (error) throw erroBanco(error);
  return data;
}

const planoSchema = z.enum(ORDEM_PLANOS as [string, ...string[]], "Plano inválido");

/**
 * Cria a assinatura no MP (POST /preapproval) e devolve o init_point (checkout).
 * O plano só é liberado quando o webhook confirmar pagamento aprovado.
 */
export async function iniciarAssinatura(ctx: Contexto, planoInput: unknown, origem: string): Promise<string> {
  const codigo = planoSchema.parse(planoInput);
  const admin = supabaseAdmin();
  const [{ data: plano, error: e1 }, { data: usuario, error: e2 }, { data: atual }] = await Promise.all([
    admin.from("planos").select("codigo, nome, preco").eq("codigo", codigo).single<{ codigo: string; nome: string; preco: number }>(),
    admin.from("usuarios").select("email").eq("id", ctx.userId).single<{ email: string }>(),
    admin
      .from("assinaturas")
      .select("plano, status, mp_preapproval_id, mp_preapproval_anterior, plano_anterior")
      .eq("user_id", ctx.userId)
      .maybeSingle<{
        plano: string;
        status: string;
        mp_preapproval_id: string | null;
        mp_preapproval_anterior: string | null;
        plano_anterior: string | null;
      }>(),
  ]);
  if (e1 || e2) throw erroBanco((e1 ?? e2)!);

  const externa = referenciaExterna(ctx.userId);
  const { MP_TEST_PAYER_EMAIL } = envMp();
  const pre = await mp<MpPreapproval>("/preapproval", {
    method: "POST",
    body: {
      reason: `CRM Multimarcas — Plano ${plano.nome}`,
      external_reference: externa,
      payer_email: MP_TEST_PAYER_EMAIL ?? usuario.email,
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: Number(plano.preco), currency_id: "BRL" },
      back_url: `${origem}/app/configurar?retorno=mp`,
      notification_url: `${origem}/api/webhooks/mercadopago`,
      status: "pending",
    },
  });
  if (!pre.init_point) throw new AppError(502, "Mercado Pago não retornou o link de pagamento", "mercado_pago");

  // Upgrade com assinatura ativa: guarda a preapproval/plano vigentes. Pagamentos da antiga mantêm o plano
  // antigo; o 1º pagamento da nova libera o plano novo e a antiga é cancelada no MP (ver aplicar_pagamento_assinatura).
  const ativa = atual?.status === "active";
  const vigente = ativa
    ? atual.mp_preapproval_anterior
      ? { mp_preapproval_anterior: atual.mp_preapproval_anterior, plano_anterior: atual.plano_anterior }
      : { mp_preapproval_anterior: atual.mp_preapproval_id, plano_anterior: atual.plano }
    : { mp_preapproval_anterior: null, plano_anterior: null };
  const { error } = await admin.from("assinaturas").upsert(
    {
      user_id: ctx.userId,
      plano: codigo,
      status: ativa ? "active" : "pending",
      external_reference: externa,
      mp_preapproval_id: pre.id,
      ...vigente,
    },
    { onConflict: "user_id" },
  );
  if (error) throw erroBanco(error);
  return pre.init_point;
}

/* ---------- Webhook / worker ---------- */

export type EventoMp = { id: string; type: string; recurso_id: string | null; tentativas: number };

/** Grava a notificação (PK = id → idempotente). Retorna false se já existia. */
export async function enfileirarEvento(evento: { id: string; type: string; recurso_id: string | null; payload: unknown }) {
  const { error, count } = await supabaseAdmin()
    .from("webhook_events")
    .upsert({ ...evento, status: "pendente" }, { onConflict: "id", ignoreDuplicates: true, count: "exact" });
  if (error) throw erroBanco(error);
  return (count ?? 0) > 0;
}

type ResultadoPagamento = { resultado: string; plano?: string; cancelar_preapproval?: string | null };

async function aplicarPagamento(payment: MpPayment, preapprovalId: string | null): Promise<string> {
  const { data, error } = await supabaseAdmin().rpc("aplicar_pagamento_assinatura", {
    p_payment_id: String(payment.id),
    p_preapproval_id: preapprovalId ?? payment.metadata?.preapproval_id ?? payment.point_of_interaction?.transaction_data?.subscription_id ?? null,
    p_external_reference: payment.external_reference ?? null,
    p_valor: payment.transaction_amount,
  });
  if (error) throw erroBanco(error);
  const r = data as ResultadoPagamento;
  // Upgrade pago: cancela a assinatura antiga no MP para não cobrar em dobro.
  if (r.cancelar_preapproval) await mp(`/preapproval/${r.cancelar_preapproval}`, { method: "PUT", body: { status: "cancelled" } });
  return r.plano ? `${r.resultado}:${r.plano}` : r.resultado;
}

const STATUS_PREAPPROVAL: Record<string, string> = { cancelled: "cancelled", paused: "paused" };

/** Processa 1 evento. Só pagamento `approved` (conferido em GET /v1/payments/{id}) libera plano. */
async function processarEvento(e: EventoMp): Promise<{ status: "processado" | "ignorado"; detalhe?: string }> {
  if (!e.recurso_id) return { status: "ignorado", detalhe: "sem data.id" };

  if (e.type === "payment") {
    const pagamento = await mp<MpPayment>(`/v1/payments/${e.recurso_id}`);
    if (pagamento.status !== "approved") return { status: "ignorado", detalhe: `payment ${pagamento.status}` };
    const r = await aplicarPagamento(pagamento, null);
    return r === "assinatura_nao_encontrada" || r === "duplicado" ? { status: "ignorado", detalhe: r } : { status: "processado", detalhe: r };
  }

  if (e.type === "subscription_authorized_payment") {
    const autorizado = await mp<MpAuthorizedPayment>(`/authorized_payments/${e.recurso_id}`);
    if (!autorizado.payment?.id) return { status: "ignorado", detalhe: "sem pagamento" };
    const pagamento = await mp<MpPayment>(`/v1/payments/${autorizado.payment.id}`);
    if (pagamento.status !== "approved") return { status: "ignorado", detalhe: `payment ${pagamento.status}` };
    const r = await aplicarPagamento({ ...pagamento, external_reference: pagamento.external_reference ?? autorizado.external_reference }, autorizado.preapproval_id);
    return r === "assinatura_nao_encontrada" || r === "duplicado" ? { status: "ignorado", detalhe: r } : { status: "processado", detalhe: r };
  }

  if (e.type === "subscription_preapproval") {
    // Cancelamento/pausa no MP: plano segue até periodo_fim; job de carência faz o downgrade 7 dias depois.
    const pre = await mp<MpPreapproval>(`/preapproval/${e.recurso_id}`);
    const status = STATUS_PREAPPROVAL[pre.status];
    if (!status) return { status: "ignorado", detalhe: `preapproval ${pre.status}` };
    const { error } = await supabaseAdmin().from("assinaturas").update({ status }).eq("mp_preapproval_id", pre.id);
    if (error) throw erroBanco(error);
    return { status: "processado", detalhe: `preapproval ${pre.status}` };
  }

  return { status: "ignorado", detalhe: `tipo ${e.type}` };
}

const MAX_TENTATIVAS = 5;

/** Worker: processa a fila (pendentes e com erro, até 5 tentativas). */
export async function processarFila(limite = 10): Promise<number> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("webhook_events")
    .select("id, type, recurso_id, tentativas")
    .in("status", ["pendente", "erro"])
    .lt("tentativas", MAX_TENTATIVAS)
    .order("recebido_em")
    .limit(limite)
    .returns<EventoMp[]>();
  if (error) throw erroBanco(error);

  for (const e of data) {
    try {
      const r = await processarEvento(e);
      await admin
        .from("webhook_events")
        .update({ status: r.status, erro: r.detalhe ?? null, processed_at: new Date().toISOString(), tentativas: e.tentativas + 1 })
        .eq("id", e.id);
    } catch (err) {
      await admin
        .from("webhook_events")
        .update({ status: "erro", erro: err instanceof Error ? err.message : String(err), tentativas: e.tentativas + 1 })
        .eq("id", e.id);
    }
  }
  return data.length;
}
