/**
 * Fase 21 (B) — MAPA ÚNICO DE STATUS DE COMISSÃO. Fonte única de verdade: todo card, filtro, relatório, exportação,
 * contador e PDF interno importa daqui. PROIBIDO escrever `status = 'x'` à mão em consumidores.
 *
 * Status gravados (CHECK de comissoes.status): prevista | recebida | reaberta | pendente_analise | cancelada.
 * 'cancelada' é status TÉCNICO (pedido cancelado — decisão A.1): fica FORA de todos os grupos e totais.
 * Espelho no banco: as funções SQL da Fase 21 usam os mesmos valores (o SQL não importa TS; ver a migration).
 */
export const GROUP_RECEBIDO = ["recebida"] as const;
export const GROUP_A_RECEBER = ["prevista", "reaberta"] as const;
export const GROUP_EM_ANALISE = ["pendente_analise"] as const;
export const STATUS_CANCELADA = "cancelada" as const;

export const STATUS_COMISSAO = [...GROUP_A_RECEBER, ...GROUP_RECEBIDO, ...GROUP_EM_ANALISE, STATUS_CANCELADA] as const;
export type StatusComissao = (typeof STATUS_COMISSAO)[number];

export const GRUPOS_STATUS = ["recebido", "a_receber", "em_analise"] as const;
export type GrupoStatus = (typeof GRUPOS_STATUS)[number];

export const STATUS_DO_GRUPO: Record<GrupoStatus, readonly StatusComissao[]> = {
  recebido: GROUP_RECEBIDO,
  a_receber: GROUP_A_RECEBER,
  em_analise: GROUP_EM_ANALISE,
};

export function statusNoGrupo(status: string | null | undefined): GrupoStatus | "desconhecido" {
  for (const g of GRUPOS_STATUS) if ((STATUS_DO_GRUPO[g] as readonly string[]).includes(status ?? "")) return g;
  return "desconhecido";
}

/** Status de uma lista de grupos (para filtros `.in("status", ...)`). */
export const statusDosGrupos = (grupos: readonly GrupoStatus[]): StatusComissao[] => grupos.flatMap((g) => [...STATUS_DO_GRUPO[g]]);

export const ROTULOS_STATUS: Record<StatusComissao, string> = {
  prevista: "Prevista",
  reaberta: "Reaberta",
  recebida: "Recebida",
  pendente_analise: "Pendente de análise",
  cancelada: "Cancelada",
};
export const rotuloStatus = (s: string) => ROTULOS_STATUS[s as StatusComissao] ?? s;

export const ROTULOS_GRUPO: Record<GrupoStatus, string> = { recebido: "Recebida", a_receber: "A receber", em_analise: "Em análise" };

/** N.2: filtro padrão de relatórios e totais — Recebida + A receber (exclui Em análise). */
export const GRUPOS_PADRAO_RELATORIO: readonly GrupoStatus[] = ["recebido", "a_receber"];

/** Rótulo de total que declara os grupos somados (N.4). */
export function rotuloTotal(grupos: readonly GrupoStatus[]): string {
  const todos = GRUPOS_STATUS.every((g) => grupos.includes(g));
  if (todos) return "Total (recebida + a receber + em análise)";
  const nomes = grupos.map((g) => ROTULOS_GRUPO[g].toLowerCase()).join(" + ");
  return `Total ${nomes || "—"}${grupos.includes("em_analise") ? "" : " (exclui em análise)"}`;
}

/** I.9: recebida, reaberta e cancelada não entram na aprovação em lote. */
export const selecionavelEmLote = (status: string) => !["recebida", "reaberta", STATUS_CANCELADA].includes(status);

/* ---------- Completude e motivos (F / H.2) ---------- */

export const MOTIVOS_PENDENCIA = [
  "comissao_nao_definida", "comissao_zero_na_planilha", "sem_data_faturamento", "sem_prazo_pagamento_comissao", "sem_prazo_cliente",
] as const;
export type MotivoPendencia = (typeof MOTIVOS_PENDENCIA)[number];
export const ROTULOS_MOTIVO: Record<MotivoPendencia, string> = {
  comissao_nao_definida: "Comissão não definida",
  comissao_zero_na_planilha: "Comissão zerada na planilha",
  sem_data_faturamento: "Pedido sem data de faturamento",
  sem_prazo_pagamento_comissao: "Representada sem prazo de pagamento da comissão",
  sem_prazo_cliente: "Pedido sem prazo de pagamento do cliente",
};
export const rotuloMotivo = (m: string) => ROTULOS_MOTIVO[m as MotivoPendencia] ?? m;

export const COMPLETUDES = ["completa", "incompleta"] as const;
export const ROTULOS_COMPLETUDE: Record<(typeof COMPLETUDES)[number], string> = { completa: "Completa", incompleta: "Incompleta" };

export const ORIGENS_CALCULO = ["representada", "catalogo", "manual", "zero"] as const;
export type OrigemCalculo = (typeof ORIGENS_CALCULO)[number];
export const ROTULOS_ORIGEM: Record<OrigemCalculo, string> = {
  representada: "Representada", catalogo: "Catálogo", manual: "Manual", zero: "Sem comissão",
};

/** O.1 — texto EXATO do aviso agregado. */
export const AVISO_PENDENTES_ANALISE = "Você possui comissões pendentes de análise";

/** Ações de linha disponíveis por status (Q.2) — derivadas dos grupos, nunca de status escrito à mão no consumidor. */
export function acoesDoStatus(status: string) {
  const g = statusNoGrupo(status);
  const cancelada = status === STATUS_CANCELADA;
  return {
    marcarRecebida: g === "a_receber",
    analisar: g === "em_analise",
    reabrir: g === "recebido",
    editarData: !cancelada,
    definir: g === "a_receber" || g === "em_analise",
    cancelada,
  };
}
