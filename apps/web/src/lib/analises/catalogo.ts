import { z } from "zod";
import type { AnaliseSpec, DimensaoId, MetricaId, TipoGrafico } from "./tipos";

/**
 * Catálogo FECHADO de dimensões e métricas. É a mesma whitelist da função SQL analise_pivot:
 * o front só envia chaves daqui; o banco traduz cada chave em expressão fixa.
 */

export type Cardinalidade = "baixa" | "alta";
export const DIMENSOES: Record<DimensaoId, { rotulo: string; cardinalidade: Cardinalidade; corte?: true }> = {
  representada: { rotulo: "Representada", cardinalidade: "baixa" },
  cliente: { rotulo: "Cliente", cardinalidade: "alta" },
  produto: { rotulo: "Produto", cardinalidade: "alta" },
  pedido: { rotulo: "Pedido", cardinalidade: "alta" },
  tempo: { rotulo: "Mês", cardinalidade: "baixa" },
  categoria: { rotulo: "Categoria", cardinalidade: "baixa" },
  status: { rotulo: "Status", cardinalidade: "baixa", corte: true },
  uf: { rotulo: "UF", cardinalidade: "baixa", corte: true },
  cidade: { rotulo: "Cidade", cardinalidade: "alta", corte: true },
  canal: { rotulo: "Canal", cardinalidade: "baixa", corte: true },
};

export type Unidade = "brl" | "numero" | "percentual";
/** aditiva: pode somar entre grupos. Não aditiva: recalculada no total (nunca somada das linhas). */
export const METRICAS: Record<MetricaId, { rotulo: string; unidade: Unidade; aditiva: boolean; casas?: number }> = {
  valor_liquido: { rotulo: "Valor líquido", unidade: "brl", aditiva: true },
  valor_bruto: { rotulo: "Valor bruto", unidade: "brl", aditiva: true },
  valor_desconto: { rotulo: "Desconto", unidade: "brl", aditiva: true },
  quantidade: { rotulo: "Quantidade", unidade: "numero", aditiva: true, casas: 3 },
  numero_pedidos: { rotulo: "Pedidos", unidade: "numero", aditiva: true },
  ticket_medio: { rotulo: "Ticket médio", unidade: "brl", aditiva: false },
  preco_medio: { rotulo: "Preço médio", unidade: "brl", aditiva: false },
  itens_por_pedido: { rotulo: "Itens por pedido", unidade: "numero", aditiva: false, casas: 2 },
  share: { rotulo: "Share", unidade: "percentual", aditiva: false },
  variacao_percentual: { rotulo: "Variação", unidade: "percentual", aditiva: false },
  clientes_ativos: { rotulo: "Clientes ativos", unidade: "numero", aditiva: false },
  representadas_ativas: { rotulo: "Representadas ativas", unidade: "numero", aditiva: false },
  skus_ativos: { rotulo: "SKUs ativos", unidade: "numero", aditiva: false },
};

export const TIPOS_GRAFICO: Record<TipoGrafico, string> = {
  barra_horizontal: "Barras", coluna: "Colunas", coluna_agrupada: "Colunas agrupadas", linha: "Linha", area: "Área", donut: "Rosca", dispersao: "Dispersão",
};

export const ROTULO_CANAL: Record<string, string> = { app: "App", catalogo_web: "Catálogo web", whatsapp: "WhatsApp" };

/* ---------- Validação da spec (servidor) ---------- */

const chaves = <T extends string>(o: Record<T, unknown>) => Object.keys(o) as [T, ...T[]];
const data = z.iso.date("Data inválida");
const ids = z.array(z.uuid("Filtro inválido")).max(500).default([]);

export const analiseSpecSchema = z
  .object({
    dataset: z.enum(["itens_pedido", "pedidos"]).default("itens_pedido"),
    granularidade: z.enum(["itens", "pedidos"]).default("itens"),
    periodo: z.object({ campo: z.literal("data").default("data"), de: data, ate: data }),
    filtros: z
      .object({
        representada_id: ids, cliente_id: ids, produto_id: ids,
        status: z.array(z.enum(["rascunho", "confirmado", "entregue", "cancelado"])).max(4).default([]),
        uf: z.array(z.string().regex(/^[A-Z]{2}$/, "UF inválida")).max(27).default([]),
        canal: z.array(z.enum(["app", "catalogo_web", "whatsapp"])).max(3).default([]),
      })
      .default({ representada_id: [], cliente_id: [], produto_id: [], status: [], uf: [], canal: [] }),
    dimensoes: z.array(z.enum(chaves(DIMENSOES))).min(1, "Escolha uma dimensão").max(4, "Máximo de 4 dimensões"),
    metricas: z.array(z.enum(chaves(METRICAS))).min(1, "Escolha uma métrica").max(13),
    grafico: z.object({
      tipo: z.enum(chaves(TIPOS_GRAFICO)),
      dimensaoLinha: z.enum(chaves(DIMENSOES)),
      dimensaoSerie: z.enum(chaves(DIMENSOES)).nullable(),
    }),
    tabela: z.object({
      colunas: z.array(z.string().max(40)).max(20),
      ordenacao: z.object({ campo: z.string().max(40), direcao: z.enum(["asc", "desc"]) }),
    }),
    limite: z.number().int().min(1).max(500).default(15),
  })
  .refine((s) => s.periodo.ate >= s.periodo.de, { message: "A data final deve ser posterior à inicial", path: ["periodo"] })
  .refine((s) => new Set(s.dimensoes).size === s.dimensoes.length && new Set(s.metricas).size === s.metricas.length, "Item repetido na spec");

/** Gráfico: no máximo 2 dimensões (1 linha + 1 série). A tabela aceita mais. */
export function bloqueioGrafico(spec: Pick<AnaliseSpec, "dimensoes">): string | null {
  return spec.dimensoes.length > 2 ? "O gráfico mostra no máximo 2 dimensões (linha + série). Use a tabela para ver mais." : null;
}

/** Hash estável da spec (cache no cliente). */
export function hashSpec(spec: AnaliseSpec): string {
  const ordenar = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(ordenar) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(ordenar(spec));
}
