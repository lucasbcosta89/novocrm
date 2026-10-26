import type { AnaliseSpec, DimensaoId, FiltrosSpec, Granularidade, MetricaId, Periodo, Preset, PresetId, TipoGrafico } from "./tipos";

/**
 * As 5 subpáginas são a MESMA tela com presets diferentes: cada preset só declara título, KPIs,
 * dimensões e métricas padrão, gráfico inicial e colunas da tabela.
 * Opcionais: dimensoes (tabela com mais de uma dimensão), granularidade fixa da aba, gráfico (linha/série),
 * graficos permitidos no seletor, ordenação e limite iniciais, rótulos de coluna, micro barra, busca e densidade.
 * `fase`: em que fase da entrega a aba fica disponível (as outras mostram "em breve").
 */
export interface PresetAba extends Preset {
  fase: 1 | 2 | 3;
  dimensoes?: DimensaoId[];
  granularidade?: Granularidade;
  graficoDims?: { linha: DimensaoId; serie: DimensaoId | null };
  graficos: TipoGrafico[];
  ordenacao?: AnaliseSpec["tabela"]["ordenacao"];
  limite: number;
  rotulos?: Partial<Record<string, string>>;
  microbarra?: MetricaId;
  busca?: boolean;
  compacta?: boolean;
}

export const PRESETS: Record<PresetId, PresetAba> = {
  representada: {
    id: "representada", fase: 1, titulo: "Por Representada",
    kpis: ["valor_liquido", "numero_pedidos", "ticket_medio", "representadas_ativas"],
    dimensaoPadrao: "representada",
    metricasPadrao: ["valor_liquido", "share", "numero_pedidos", "ticket_medio", "clientes_ativos", "variacao_percentual", "representadas_ativas"],
    graficoTipo: "barra_horizontal", graficos: ["barra_horizontal", "coluna", "donut"],
    colunas: ["representada", "valor_liquido", "share", "numero_pedidos", "ticket_medio", "clientes_ativos", "variacao_percentual"],
    limite: 15,
  },
  cliente: {
    id: "cliente", fase: 2, titulo: "Por Cliente",
    kpis: ["clientes_ativos", "clientes_novos", "clientes_em_risco", "concentracao"],
    dimensaoPadrao: "cliente",
    metricasPadrao: ["valor_liquido", "numero_pedidos", "ticket_medio", "clientes_ativos", "clientes_novos", "clientes_em_risco", "concentracao", "classe_abc", "ultima_compra", "dias_sem_comprar"],
    graficoTipo: "dispersao", graficos: ["dispersao", "barra_horizontal"],
    colunas: ["cliente", "classe_abc", "valor_liquido", "numero_pedidos", "ticket_medio", "ultima_compra", "dias_sem_comprar"],
    ordenacao: { campo: "valor_liquido", direcao: "desc" },
    limite: 500, busca: true,
  },
  produto: {
    id: "produto", fase: 2, titulo: "Por Produto",
    kpis: ["skus_ativos", "quantidade", "preco_medio", { indisponivel: "% devoluções", motivo: "sem dados de devolução" }],
    dimensaoPadrao: "produto", dimensoes: ["produto", "categoria", "representada"], granularidade: "itens",
    metricasPadrao: ["valor_liquido", "quantidade", "preco_medio", "share", "numero_pedidos", "skus_ativos"],
    graficoTipo: "coluna_agrupada", graficoDims: { linha: "categoria", serie: "representada" }, graficos: ["coluna_agrupada", "barra_horizontal", "donut"],
    colunas: ["produto", "categoria", "representada", "quantidade", "valor_liquido", "preco_medio", "share", "numero_pedidos"],
    rotulos: { numero_pedidos: "Giro (pedidos)" }, microbarra: "numero_pedidos",
    ordenacao: { campo: "valor_liquido", direcao: "desc" },
    limite: 500,
  },
  pedido: {
    id: "pedido", fase: 2, titulo: "Por Pedido",
    kpis: ["numero_pedidos", "ticket_medio", "itens_por_pedido", "pedidos_cancelados"],
    dimensaoPadrao: "pedido", dimensoes: ["pedido", "dia", "cliente", "representada", "status"], granularidade: "pedidos",
    metricasPadrao: ["valor_liquido", "itens_por_pedido", "numero_pedidos", "ticket_medio", "pedidos_cancelados"],
    graficoTipo: "histograma", graficos: ["histograma"],
    colunas: ["pedido", "dia", "cliente", "representada", "itens_por_pedido", "valor_liquido", "status"],
    rotulos: { pedido: "Nº do pedido", itens_por_pedido: "Itens", valor_liquido: "Valor" },
    ordenacao: { campo: "dia", direcao: "desc" },
    limite: 500, compacta: true,
  },
  mix: {
    id: "mix", fase: 3, titulo: "Análise de Mix",
    kpis: ["valor_liquido", "clientes_ativos", "share", "variacao_percentual"],
    dimensaoPadrao: "categoria",
    metricasPadrao: ["valor_liquido", "share", "clientes_ativos"],
    graficoTipo: "coluna", graficos: ["coluna"],
    colunas: ["categoria", "share", "clientes_ativos"],
    limite: 15,
  },
};

export const ORDEM_PRESETS: PresetId[] = ["representada", "cliente", "produto", "pedido", "mix"];
export const ehPreset = (v: string): v is PresetId => (ORDEM_PRESETS as string[]).includes(v);

/** Spec inicial de uma aba a partir do preset + filtros globais (que valem para todas as abas). */
export function specDoPreset(id: PresetId, periodo: Periodo, filtros: FiltrosSpec, granularidade: Granularidade): AnaliseSpec {
  const p = PRESETS[id];
  const gran = p.granularidade ?? granularidade;
  return {
    dataset: gran === "pedidos" ? "pedidos" : "itens_pedido",
    granularidade: gran,
    periodo,
    filtros,
    dimensoes: [...(p.dimensoes ?? [p.dimensaoPadrao])],
    metricas: [...p.metricasPadrao],
    grafico: { tipo: p.graficoTipo, dimensaoLinha: p.graficoDims?.linha ?? p.dimensaoPadrao, dimensaoSerie: p.graficoDims?.serie ?? null },
    tabela: { colunas: [...p.colunas], ordenacao: p.ordenacao ?? { campo: p.metricasPadrao[0]!, direcao: "desc" } },
    limite: p.limite,
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
