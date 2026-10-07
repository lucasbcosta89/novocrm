// Espelho do seed de `planos` em schema.sql (Fase 6). null = ilimitado.
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

export const PLANOS = {
  solo: { preco: 49, limites: { representadas: 1, clientes: 100, conversas_mes: 200, pdf_mes: 30, oportunidades: 100 } },
  profissional: { preco: 89, limites: { representadas: 3, clientes: 1000, conversas_mes: 500, pdf_mes: 100, oportunidades: 1000 } },
  pro: { preco: 149, limites: { representadas: null, clientes: null, conversas_mes: 1500, pdf_mes: null, oportunidades: null } },
} as const satisfies Record<string, { preco: number; limites: Limites }>;

export type PlanoCodigo = keyof typeof PLANOS;
export const ORDEM_PLANOS: PlanoCodigo[] = ["solo", "profissional", "pro"];

export function mesAtual(agora = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(agora);
}

/** Carência de 7 dias após o vencimento antes do downgrade (espelha aplicar_carencia_assinaturas). */
export const CARENCIA_DIAS = 7;

/** Se a assinatura está vencida mas dentro da carência, retorna a data-limite; senão null. */
export function fimDaCarencia(periodoFim: string | null, agora = new Date()): Date | null {
  if (!periodoFim) return null;
  const fim = new Date(periodoFim).getTime();
  const limite = fim + CARENCIA_DIAS * 24 * 60 * 60 * 1000;
  return agora.getTime() > fim && agora.getTime() <= limite ? new Date(limite) : null;
}
