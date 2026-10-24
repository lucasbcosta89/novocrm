import type { AnaliseSpec, FiltrosSpec, Granularidade, Periodo, Preset, PresetId } from "./tipos";

/**
 * As 5 subpáginas são a MESMA tela com presets diferentes: cada preset só declara título, KPIs,
 * dimensão e métricas padrão, gráfico inicial e colunas da tabela.
 * `fase`: em que fase da entrega a aba fica disponível (as outras mostram "em breve").
 */
export const PRESETS: Record<PresetId, Preset & { fase: 1 | 2 | 3 }> = {
  representada: {
    id: "representada", fase: 1, titulo: "Por Representada",
    kpis: ["valor_liquido", "numero_pedidos", "ticket_medio", "representadas_ativas"],
    dimensaoPadrao: "representada",
    metricasPadrao: ["valor_liquido", "share", "numero_pedidos", "ticket_medio", "clientes_ativos", "variacao_percentual", "representadas_ativas"],
    graficoTipo: "barra_horizontal",
    colunas: ["representada", "valor_liquido", "share", "numero_pedidos", "ticket_medio", "clientes_ativos", "variacao_percentual"],
  },
  cliente: {
    id: "cliente", fase: 2, titulo: "Por Cliente",
    kpis: ["clientes_ativos", "valor_liquido", "ticket_medio", "numero_pedidos"],
    dimensaoPadrao: "cliente",
    metricasPadrao: ["valor_liquido", "numero_pedidos", "ticket_medio", "clientes_ativos"],
    graficoTipo: "dispersao",
    colunas: ["cliente", "valor_liquido", "numero_pedidos", "ticket_medio"],
  },
  produto: {
    id: "produto", fase: 2, titulo: "Por Produto",
    kpis: ["skus_ativos", "quantidade", "preco_medio", "valor_liquido"],
    dimensaoPadrao: "produto",
    metricasPadrao: ["quantidade", "valor_liquido", "preco_medio", "share", "skus_ativos"],
    graficoTipo: "coluna_agrupada",
    colunas: ["produto", "quantidade", "valor_liquido", "preco_medio", "share"],
  },
  pedido: {
    id: "pedido", fase: 2, titulo: "Por Pedido",
    kpis: ["numero_pedidos", "ticket_medio", "itens_por_pedido", "valor_liquido"],
    dimensaoPadrao: "pedido",
    metricasPadrao: ["valor_liquido", "itens_por_pedido", "numero_pedidos", "ticket_medio"],
    graficoTipo: "coluna",
    colunas: ["pedido", "valor_liquido", "itens_por_pedido"],
  },
  mix: {
    id: "mix", fase: 3, titulo: "Análise de Mix",
    kpis: ["valor_liquido", "clientes_ativos", "share", "variacao_percentual"],
    dimensaoPadrao: "categoria",
    metricasPadrao: ["valor_liquido", "share", "clientes_ativos"],
    graficoTipo: "coluna",
    colunas: ["categoria", "share", "clientes_ativos"],
  },
};

export const ORDEM_PRESETS: PresetId[] = ["representada", "cliente", "produto", "pedido", "mix"];
export const ehPreset = (v: string): v is PresetId => (ORDEM_PRESETS as string[]).includes(v);

/** Spec inicial de uma aba a partir do preset + filtros globais (que valem para todas as abas). */
export function specDoPreset(id: PresetId, periodo: Periodo, filtros: FiltrosSpec, granularidade: Granularidade): AnaliseSpec {
  const p = PRESETS[id];
  return {
    dataset: granularidade === "pedidos" ? "pedidos" : "itens_pedido",
    granularidade,
    periodo,
    filtros,
    dimensoes: [p.dimensaoPadrao],
    metricas: [...p.metricasPadrao],
    grafico: { tipo: p.graficoTipo, dimensaoLinha: p.dimensaoPadrao, dimensaoSerie: null },
    tabela: { colunas: [...p.colunas], ordenacao: { campo: p.metricasPadrao[0]!, direcao: "desc" } },
    limite: 15,
  };
}

/* ---------- Período (fuso de Brasília) ---------- */

export const PERIODOS_PRESET = { "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", "90d": "Últimos 90 dias", ano: "Este ano", ano_anterior: "Ano anterior", personalizado: "Personalizado" } as const;
export type PeriodoPreset = keyof typeof PERIODOS_PRESET;

const hojeSP = (agora: Date) => agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const menosDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** Intervalo [de, ate] do preset de período (inclusivo). Default: 90 dias. */
export function resolverPeriodo(p: string | null, de: string | null, ate: string | null, agora = new Date()): { preset: PeriodoPreset; periodo: Periodo } {
  const hoje = hojeSP(agora);
  const ano = hoje.slice(0, 4);
  const valida = (d: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  switch (p) {
    case "7d": return { preset: "7d", periodo: { campo: "data", de: menosDias(hoje, 6), ate: hoje } };
    case "30d": return { preset: "30d", periodo: { campo: "data", de: menosDias(hoje, 29), ate: hoje } };
    case "ano": return { preset: "ano", periodo: { campo: "data", de: `${ano}-01-01`, ate: hoje } };
    case "ano_anterior": return { preset: "ano_anterior", periodo: { campo: "data", de: `${Number(ano) - 1}-01-01`, ate: `${Number(ano) - 1}-12-31` } };
    case "personalizado":
      if (valida(de) && valida(ate) && de <= ate) return { preset: "personalizado", periodo: { campo: "data", de, ate } };
      return resolverPeriodo("90d", null, null, agora);
    default: return { preset: "90d", periodo: { campo: "data", de: menosDias(hoje, 89), ate: hoje } };
  }
}
