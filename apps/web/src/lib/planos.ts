/**
 * Plano ÚNICO da Plurima (espelho da linha 'plurima' em planos — schema.sql). Todas as funcionalidades abertas,
 * sem limite de representadas, clientes, oportunidades ou PDFs. Proteções de uso justo (não são limites de plano):
 * PDFs por janela de tempo (trigger documentos_uso_justo) e WhatsApp até 1.500 conversas/mês (custo da Meta).
 */
export const RECURSOS = ["representadas", "clientes", "oportunidades", "conversas_mes", "pdf_mes"] as const;
export type Recurso = (typeof RECURSOS)[number];
export type Limites = Record<Recurso, number | null>;

/** Mensais zeram a cada mês (chave YYYY-MM em usage); os demais são acumulados (chave 'total'). */
export const RECURSOS_MENSAIS: readonly Recurso[] = ["conversas_mes", "pdf_mes"];

export const ROTULO_RECURSO: Record<Recurso, string> = {
  representadas: "Representadas",
  clientes: "Clientes",
  oportunidades: "Oportunidades",
  conversas_mes: "Conversas WhatsApp/mês",
  pdf_mes: "PDFs/mês",
};

export const PLANO = {
  codigo: "plurima",
  nome: "Plurima",
  limites: { representadas: null, clientes: null, oportunidades: null, pdf_mes: null, conversas_mes: 1500 } satisfies Limites,
} as const;

/**
 * Formas de pagamento do plano único (espelho de aplicar_pagamento_avulso / assinaturas.forma no banco):
 * - cartao_mensal: R$ 129,90/mês recorrente no cartão (assinatura do MP; cancela quando quiser);
 * - cartao_anual: R$ 1.318,80 em até 12x de R$ 109,90 no cartão (pagamento único parcelado; 12 meses);
 * - pix_mensal: R$ 109,90 à vista no Pix (1 mês; renova manualmente);
 * - pix_anual: R$ 1.078,80 à vista no Pix (12 meses; equivale a R$ 89,90/mês).
 */
export const FORMAS = {
  cartao_mensal: { meio: "cartao", ciclo: "mensal", rotulo: "Cartão mensal", cobranca: 129.9, valorMensal: 129.9, meses: 1, parcelas: 1, recorrente: true },
  cartao_anual: { meio: "cartao", ciclo: "anual", rotulo: "Cartão anual", cobranca: 1318.8, valorMensal: 109.9, meses: 12, parcelas: 12, recorrente: false },
  pix_mensal: { meio: "pix", ciclo: "mensal", rotulo: "Pix mensal", cobranca: 109.9, valorMensal: 109.9, meses: 1, parcelas: 1, recorrente: false },
  pix_anual: { meio: "pix", ciclo: "anual", rotulo: "Pix anual", cobranca: 1078.8, valorMensal: 89.9, meses: 12, parcelas: 1, recorrente: false },
} as const;
export type Forma = keyof typeof FORMAS;
export const ORDEM_FORMAS: Forma[] = ["cartao_mensal", "cartao_anual", "pix_mensal", "pix_anual"];
export type Ciclo = "mensal" | "anual";
/** economia (%) de uma forma sobre 12 meses no cartão mensal */
export const economia = (f: Forma) => Math.round((1 - FORMAS[f].valorMensal / FORMAS.cartao_mensal.valorMensal) * 100);

/** Trial gratuito, sem cartão, contado do cadastro (espelha usuarios.trial_fim). */
export const TRIAL_DIAS = 7;

export function mesAtual(agora = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(agora);
}

/** Carência de 7 dias após o vencimento antes de a conta virar somente leitura (espelha acesso_usuario). */
export const CARENCIA_DIAS = 7;

/** Se a assinatura está vencida mas dentro da carência, retorna a data-limite; senão null. */
export function fimDaCarencia(periodoFim: string | null, agora = new Date()): Date | null {
  if (!periodoFim) return null;
  const fim = new Date(periodoFim).getTime();
  const limite = fim + CARENCIA_DIAS * 24 * 60 * 60 * 1000;
  return agora.getTime() > fim && agora.getTime() <= limite ? new Date(limite) : null;
}

/** Estado de acesso (espelho da função SQL acesso_usuario). leitura = vê e exporta, não cria nem edita. */
export type EstadoAcesso = "assinante" | "carencia" | "trial" | "leitura";

export function calcularAcesso(
  a: { trial_fim: string | null; assinatura: { status: string; periodo_fim: string | null } | null },
  agora = new Date(),
): EstadoAcesso {
  const vigente = a.assinatura && ["active", "paused", "cancelled"].includes(a.assinatura.status) && a.assinatura.periodo_fim;
  if (vigente) {
    const fim = new Date(a.assinatura!.periodo_fim!).getTime();
    if (fim > agora.getTime()) return "assinante";
    if (fim + CARENCIA_DIAS * 86_400_000 > agora.getTime()) return "carencia";
  }
  if (a.trial_fim && new Date(a.trial_fim).getTime() > agora.getTime()) return "trial";
  return "leitura";
}

/** dias restantes (arredondado para cima) até a data */
export const diasAte = (iso: string | null, agora = new Date()) =>
  iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - agora.getTime()) / 86_400_000)) : 0;
