/**
 * Contrato do módulo Análises (compartilhado entre front e back).
 * A spec é serializável em JSON e é exatamente o que se persiste em "visões salvas".
 *
 * Ajustes ao banco real (confirmados no schema):
 * - sem "tabela_preco" (não há tabelas de preço nomeadas: só a padrão e as específicas por cliente);
 * - sem "margem_percentual" (não há custo de produto);
 * - "canal" = pedidos.origem (app | catalogo_web | whatsapp);
 * - "categoria" (produtos.categoria) entra como dimensão — usada pelos presets de Produto e Mix;
 * - "representadas_ativas" e "skus_ativos" entram como métricas de contagem distinta (KPIs);
 * - Fase 2: dimensão "dia"; métricas de cliente (ultima_compra, dias_sem_comprar, clientes_novos, clientes_em_risco,
 *   classe_abc, concentracao = share do top 10), pedidos_cancelados; gráfico "histograma" (faixas de ticket).
 */

export type Dataset = "itens_pedido" | "pedidos";
export type Granularidade = "itens" | "pedidos";

export type DimensaoId =
  | "representada" | "cliente" | "produto" | "pedido" | "tempo"
  | "status" | "uf" | "cidade" | "canal" | "categoria" | "dia";

export type MetricaId =
  | "valor_liquido" | "valor_bruto" | "valor_desconto" | "quantidade" | "numero_pedidos"
  | "ticket_medio" | "preco_medio" | "itens_por_pedido" | "share"
  | "variacao_percentual" | "clientes_ativos" | "representadas_ativas" | "skus_ativos"
  | "clientes_novos" | "clientes_em_risco" | "concentracao" | "classe_abc" | "ultima_compra" | "dias_sem_comprar"
  | "pedidos_cancelados";

export interface Periodo { campo: "data"; de: string; ate: string }

export interface FiltrosSpec {
  representada_id: string[];
  cliente_id: string[];
  produto_id: string[];
  status: string[];
  uf: string[];
  canal: string[];
}

export type TipoGrafico = "barra_horizontal" | "coluna" | "coluna_agrupada" | "linha" | "area" | "donut" | "dispersao" | "histograma";

export interface GraficoSpec {
  tipo: TipoGrafico;
  dimensaoLinha: DimensaoId;
  dimensaoSerie: DimensaoId | null;
}

export interface TabelaSpec {
  colunas: string[];
  ordenacao: { campo: string; direcao: "asc" | "desc" };
}

export interface AnaliseSpec {
  dataset: Dataset;
  granularidade: Granularidade;
  periodo: Periodo;
  filtros: FiltrosSpec;
  dimensoes: DimensaoId[];
  metricas: MetricaId[];
  grafico: GraficoSpec;
  tabela: TabelaSpec;
  limite: number;
}

export interface ResultadoAgregado {
  linhas: Array<Record<string, string | number | null>>;
  totais: Record<string, number | null>;
  totalLinhas: number;
  agrupouOutros: boolean;
  geradoEm: string;
}

export type PresetId = "representada" | "cliente" | "produto" | "pedido" | "mix";

/** KPI de um preset: métrica do catálogo, ou indicador sem dado na base (exibido como "—" com o motivo). */
export type KpiPreset = MetricaId | { indisponivel: string; motivo: string };

export interface Preset {
  id: PresetId;
  titulo: string;
  kpis: KpiPreset[];
  dimensaoPadrao: DimensaoId;
  metricasPadrao: MetricaId[];
  graficoTipo: TipoGrafico;
  colunas: string[];
}

export interface VisaoSalva {
  id: string;
  nome: string;
  spec: AnaliseSpec;
  escopo: "subpagina" | "compartilhada";
  criadoEm: string;
}
