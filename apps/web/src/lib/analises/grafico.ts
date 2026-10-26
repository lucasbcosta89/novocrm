import type { DimensaoId, MetricaId, ResultadoAgregado } from "./tipos";

/**
 * Preparação dos dados do gráfico a partir das MESMAS linhas da tabela (uma consulta só).
 * Rollups somam apenas métricas aditivas (valor, quantidade…); o total exibido vem sempre de `totais`.
 */
type Linhas = ResultadoAgregado["linhas"];
export type Ponto = { id: string; nome: string; valor: number };

const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v));

/** Soma a métrica por uma dimensão (a dimensão pode ser atributo das linhas, ex.: categoria do produto). */
export function somarPor(linhas: Linhas, dim: DimensaoId, metrica: MetricaId): Ponto[] {
  const mapa = new Map<string, Ponto>();
  for (const l of linhas) {
    const id = String(l[`${dim}__id`] ?? l[dim] ?? "—");
    const p = mapa.get(id) ?? { id, nome: String(l[dim] ?? "—"), valor: 0 };
    p.valor += num(l[metrica]);
    mapa.set(id, p);
  }
  return [...mapa.values()].map((p) => ({ ...p, valor: Math.round(p.valor * 100) / 100 })).sort((a, b) => b.valor - a.valor);
}

/** Colunas agrupadas: linha × série (ex.: categoria × representada). */
export function agrupar(linhas: Linhas, linha: DimensaoId, serie: DimensaoId, metrica: MetricaId) {
  const series = somarPor(linhas, serie, metrica).map((s) => s.nome);
  const grupos = new Map<string, Record<string, number | string>>();
  for (const l of linhas) {
    const g = String(l[linha] ?? "—");
    const s = String(l[serie] ?? "—");
    const reg = grupos.get(g) ?? { nome: g };
    reg[s] = Math.round((num(reg[s]) + num(l[metrica])) * 100) / 100;
    grupos.set(g, reg);
  }
  const total = (r: Record<string, number | string>) => series.reduce((t, s) => t + num(r[s]), 0);
  return { series, dados: [...grupos.values()].sort((a, b) => total(b) - total(a)) };
}

/** Faixas de ticket (valor do pedido) para o histograma da aba Por Pedido. */
export const FAIXAS_TICKET = [0, 500, 1000, 2500, 5000, 10000, 25000] as const;

export function histograma(linhas: Linhas, metrica: MetricaId) {
  const curto = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR")} mil` : String(v));
  const faixas = FAIXAS_TICKET.map((de, i) => {
    const ate = FAIXAS_TICKET[i + 1];
    return { de, ate: ate ?? Infinity, nome: ate ? `${curto(de)}–${curto(ate)}` : `${curto(de)}+`, pedidos: 0, valor: 0 };
  });
  for (const l of linhas) {
    const v = num(l[metrica]);
    const f = faixas.find((x) => v >= x.de && v < x.ate) ?? faixas[0]!;
    f.pedidos += 1;
    f.valor = Math.round((f.valor + v) * 100) / 100;
  }
  return faixas;
}
