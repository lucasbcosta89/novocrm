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

/** Ciclos de cobrança do plano único. Anual: R$ 99,90/mês cobrados de uma vez (12 × 99,90 = R$ 1.198,80/ano). */
export const CICLOS = {
  mensal: { rotulo: "Mensal", valorMensal: 119.9, cobranca: 119.9, meses: 1 },
  anual: { rotulo: "Anual", valorMensal: 99.9, cobranca: 1198.8, meses: 12 },
} as const;
export type Ciclo = keyof typeof CICLOS;
export const ORDEM_CICLOS: Ciclo[] = ["mensal", "anual"];
/** economia do anual sobre 12 mensalidades (%) */
export const ECONOMIA_ANUAL = Math.round((1 - CICLOS.anual.cobranca / (CICLOS.mensal.cobranca * 12)) * 100);

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
