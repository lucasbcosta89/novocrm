import "server-only";
import { z } from "zod";
import { envMp } from "@/lib/env";
import { FORMAS, ORDEM_FORMAS, PLANO, type Forma } from "@/lib/planos";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";
import { mp, type MpAuthorizedPayment, type MpPayment, type MpPreapproval, type MpPreference } from "./mercadopago";

export type Assinatura = {
  plano: string;
  ciclo: "mensal" | "anual";
  forma: Forma | null;
  status: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
};

export const referenciaExterna = (userId: string) => `user_${userId}`;

export async function obterAssinatura({ supabase, userId }: Contexto): Promise<Assinatura | null> {
  const { data, error } = await supabase
    .from("assinaturas")
    .select("plano, ciclo, forma, status, periodo_inicio, periodo_fim")
    .eq("user_id", userId)
    .maybeSingle<Assinatura>();
  if (error) throw erroBanco(error);
  return data;
}

const formaSchema = z.enum(ORDEM_FORMAS as [Forma, ...Forma[]], "Escolha uma forma de pagamento");

/** Referência dos pagamentos únicos (Pix e cartão anual parcelado): avulso:<user_id>:<forma>. */
export const referenciaAvulso = (userId: string, forma: Forma) => `avulso:${userId}:${forma}`;
const FORMAS_AVULSAS = ORDEM_FORMAS.filter((f) => !FORMAS[f].recorrente);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lerReferenciaAvulso(ref: string | null | undefined): { userId: string; forma: Forma } | null {
  const [prefixo, userId, forma] = (ref ?? "").split(":");
  if (prefixo !== "avulso" || !userId || !UUID.test(userId) || !FORMAS_AVULSAS.includes(forma as Forma)) return null;
  return { userId, forma: forma as Forma };
}

/**
 * Inicia o pagamento na forma escolhida e devolve o link do checkout do Mercado Pago.
 * - cartao_mensal: assinatura recorrente (POST /preapproval), R$ 129,90 todo mês até o cliente cancelar;
 * - cartao_anual / pix_mensal / pix_anual: pagamento único (POST /checkout/preferences) que libera 1 ou 12 meses.
 * O acesso só é liberado quando o webhook (ou a conciliação) confirmar o pagamento aprovado.
 */
export async function iniciarAssinatura(ctx: Contexto, formaInput: unknown, origem: string): Promise<string> {
  const forma = formaSchema.parse(formaInput);
  if (!origem.startsWith("https://")) {
    throw new AppError(400, "O checkout do Mercado Pago só funciona pelo endereço público (https), não pelo localhost.", "mercado_pago");
  }
  return FORMAS[forma].recorrente ? iniciarRecorrente(ctx, origem) : iniciarAvulso(ctx, forma, origem);
}

async function iniciarAvulso(ctx: Contexto, forma: Forma, origem: string): Promise<string> {
  const f = FORMAS[forma];
  const { data: usuario, error } = await supabaseAdmin().from("usuarios").select("email").eq("id", ctx.userId).single<{ email: string }>();
  if (error) throw erroBanco(error);
  const { MP_TEST_PAYER_EMAIL } = envMp();
  // Pix: só Pix (bank_transfer). Cartão anual: só crédito, até 12x — "sem juros" (juros por conta da Plurima)
  // é configurado na conta do Mercado Pago.
  const excluidos = f.meio === "pix"
    ? ["credit_card", "debit_card", "prepaid_card", "ticket", "atm"]
    : ["debit_card", "prepaid_card", "ticket", "atm", "bank_transfer"];
  const pref = await mp<MpPreference>("/checkout/preferences", {
    method: "POST",
    body: {
      items: [{
        id: `plurima_${forma}`,
        title: `${PLANO.nome} — ${f.ciclo === "anual" ? "12 meses" : "1 mês"} (${f.rotulo})`,
        quantity: 1, unit_price: f.cobranca, currency_id: "BRL",
      }],
      payer: { email: MP_TEST_PAYER_EMAIL ?? usuario.email },
      external_reference: referenciaAvulso(ctx.userId, forma),
      payment_methods: { excluded_payment_types: excluidos.map((id) => ({ id })), installments: f.parcelas },
      back_urls: {
        success: `${origem}/app/configurar?retorno=mp`,
        pending: `${origem}/app/configurar?retorno=mp`,
        failure: `${origem}/app/configurar`,
      },
      auto_return: "approved",
      notification_url: `${origem}/api/webhooks/mercadopago`,
      statement_descriptor: "PLURIMA",
    },
  });
  if (!pref.init_point) throw new AppError(502, "Mercado Pago não retornou o link de pagamento", "mercado_pago");
  return pref.init_point;
}

async function iniciarRecorrente(ctx: Contexto, origem: string): Promise<string> {
  const ciclo = "mensal" as const;
  const preco = FORMAS.cartao_mensal;
  const admin = supabaseAdmin();
  const [{ data: usuario, error: e2 }, { data: atual }] = await Promise.all([
    admin.from("usuarios").select("email").eq("id", ctx.userId).single<{ email: string }>(),
    admin
      .from("assinaturas")
      .select("ciclo, forma, status, periodo_fim, mp_preapproval_id, mp_preapproval_anterior, ciclo_anterior")
      .eq("user_id", ctx.userId)
      .maybeSingle<{
        ciclo: "mensal" | "anual";
        forma: Forma | null;
        status: string;
        periodo_fim: string | null;
        mp_preapproval_id: string | null;
        mp_preapproval_anterior: string | null;
        ciclo_anterior: "mensal" | "anual" | null;
      }>(),
  ]);
  if (e2) throw erroBanco(e2);
  const ativa = atual?.status === "active" && !!atual.periodo_fim && new Date(atual.periodo_fim).getTime() > Date.now();
  if (ativa && atual.forma === "cartao_mensal" && atual.mp_preapproval_id && !atual.mp_preapproval_anterior) {
    throw new AppError(409, "Você já tem a assinatura mensal no cartão ativa.", "assinatura_ativa");
  }

  const externa = referenciaExterna(ctx.userId);
  const { MP_TEST_PAYER_EMAIL } = envMp();
  const pre = await mp<MpPreapproval>("/preapproval", {
    method: "POST",
    body: {
      reason: `${PLANO.nome} — assinatura mensal`,
      external_reference: externa,
      payer_email: MP_TEST_PAYER_EMAIL ?? usuario.email,
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: preco.cobranca, currency_id: "BRL" },
      back_url: `${origem}/app/configurar?retorno=mp`,
      notification_url: `${origem}/api/webhooks/mercadopago`,
      status: "pending",
    },
  });
  if (!pre.init_point) throw new AppError(502, "Mercado Pago não retornou o link de pagamento", "mercado_pago");

  // Troca de ciclo com assinatura ativa: guarda a preapproval/ciclo vigentes. Pagamentos da antiga mantêm o ciclo
  // antigo; o 1º pagamento da nova vale o ciclo novo e a antiga é cancelada no MP (ver aplicar_pagamento_assinatura).
  const vigente = ativa
    ? atual.mp_preapproval_anterior
      ? { mp_preapproval_anterior: atual.mp_preapproval_anterior, ciclo_anterior: atual.ciclo_anterior }
      : { mp_preapproval_anterior: atual.mp_preapproval_id, ciclo_anterior: atual.ciclo }
    : { mp_preapproval_anterior: null, ciclo_anterior: null };
  const { error } = await admin.from("assinaturas").upsert(
    {
      user_id: ctx.userId,
      plano: PLANO.codigo,
      ciclo,
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

async function aplicarAvulso(payment: MpPayment, ref: { userId: string; forma: Forma }): Promise<string> {
  const { data, error } = await supabaseAdmin().rpc("aplicar_pagamento_avulso", {
    p_payment_id: String(payment.id), p_user_id: ref.userId, p_forma: ref.forma, p_valor: payment.transaction_amount,
  });
  if (error) throw erroBanco(error);
  const r = data as ResultadoPagamento;
  // Trocou o cartão mensal recorrente por Pix/anual: cancela a recorrência no MP para não cobrar em dobro.
  if (r.cancelar_preapproval) {
    await mp(`/preapproval/${r.cancelar_preapproval}`, { method: "PUT", body: { status: "cancelled" } }).catch((e) => console.error("cancelar preapproval", e));
  }
  return `${r.resultado}:${ref.forma}`;
}

async function aplicarPagamento(payment: MpPayment, preapprovalId: string | null): Promise<string> {
  const avulso = preapprovalId ? null : lerReferenciaAvulso(payment.external_reference);
  if (avulso) return aplicarAvulso(payment, avulso);
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

/**
 * Conciliação: consulta no MP os pagamentos da assinatura do usuário e aplica os aprovados
 * (GET /v1/payments/{id} confirma "approved"). Rede de segurança caso um webhook se perca; idempotente.
 */
export async function conciliarAssinatura(userId: string): Promise<{ aplicados: number }> {
  const { data: a } = await supabaseAdmin()
    .from("assinaturas")
    .select("mp_preapproval_id, mp_preapproval_anterior")
    .eq("user_id", userId)
    .maybeSingle<{ mp_preapproval_id: string | null; mp_preapproval_anterior: string | null }>();
  let aplicados = 0;
  for (const preapprovalId of [a?.mp_preapproval_anterior, a?.mp_preapproval_id]) {
    if (!preapprovalId) continue;
    const busca = await mp<{ results?: MpAuthorizedPayment[] }>(`/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`);
    for (const autorizado of busca.results ?? []) {
      if (autorizado.payment?.status !== "approved") continue;
      const pagamento = await mp<MpPayment>(`/v1/payments/${autorizado.payment.id}`);
      if (pagamento.status !== "approved") continue;
      const r = await aplicarPagamento({ ...pagamento, external_reference: pagamento.external_reference ?? autorizado.external_reference }, preapprovalId);
      if (r.startsWith("ativada") || r.startsWith("estendida")) aplicados++;
    }
  }
  // Pagamentos únicos (Pix / cartão anual) aprovados e ainda não aplicados (idempotente)
  for (const forma of FORMAS_AVULSAS) {
    const ref = referenciaAvulso(userId, forma);
    const busca = await mp<{ results?: MpPayment[] }>(`/v1/payments/search?external_reference=${encodeURIComponent(ref)}&status=approved`);
    for (const pagamento of busca.results ?? []) {
      if (pagamento.status !== "approved") continue;
      const r = await aplicarAvulso(pagamento, { userId, forma });
      if (r.startsWith("ativada") || r.startsWith("estendida")) aplicados++;
    }
  }
  return { aplicados };
}

/** Cancela a assinatura mensal no cartão (o acesso segue até o fim do período já pago). */
export async function cancelarAssinatura(ctx: Contexto): Promise<void> {
  const admin = supabaseAdmin();
  const { data: a, error } = await admin.from("assinaturas").select("mp_preapproval_id, status").eq("user_id", ctx.userId)
    .maybeSingle<{ mp_preapproval_id: string | null; status: string }>();
  if (error) throw erroBanco(error);
  if (!a?.mp_preapproval_id || !["active", "pending", "paused"].includes(a.status)) {
    throw new AppError(409, "Não há assinatura recorrente no cartão para cancelar.", "sem_assinatura");
  }
  await mp(`/preapproval/${a.mp_preapproval_id}`, { method: "PUT", body: { status: "cancelled" } });
  const { error: e2 } = await admin.from("assinaturas").update({ status: a.status === "pending" ? "expired" : "cancelled" }).eq("user_id", ctx.userId);
  if (e2) throw erroBanco(e2);
}

/** Concilia todas as assinaturas pendentes/ativas (usado pelo cron). */
export async function conciliarTodas(): Promise<number> {
  const { data } = await supabaseAdmin()
    .from("assinaturas")
    .select("user_id")
    .not("mp_preapproval_id", "is", null)
    .in("status", ["pending", "active"]);
  let total = 0;
  for (const { user_id } of data ?? []) {
    total += (await conciliarAssinatura(user_id as string).catch(() => ({ aplicados: 0 }))).aplicados;
  }
  return total;
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
      // recusa definitiva do MP (4xx, ex.: pagamento inexistente) não adianta repetir; 5xx/rede fica para nova tentativa
      const definitivo = err instanceof AppError && err.code === "mercado_pago" && err.status === 400;
      await admin
        .from("webhook_events")
        .update({
          status: definitivo ? "ignorado" : "erro",
          erro: err instanceof Error ? err.message : String(err),
          tentativas: e.tentativas + 1,
          ...(definitivo ? { processed_at: new Date().toISOString() } : {}),
        })
        .eq("id", e.id);
    }
  }
  return data.length;
}
