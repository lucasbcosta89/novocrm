import { z } from "zod";

/** Dashboard principal (Fase 9-1): parâmetros, períodos e agregações puras (sem acesso ao banco). */
export const PERIODOS = ["3m", "6m", "12m", "ano"] as const;
export type Periodo = (typeof PERIODOS)[number];

export const dashboardQuerySchema = z.object({
  periodo: z.preprocess((v) => (v == null || v === "" ? "6m" : v), z.enum(PERIODOS, "Período inválido (3m, 6m, 12m ou ano)")),
  representada_id: z.preprocess(
    (v) => (v == null || v === "" ? "todas" : v),
    z.union([z.literal("todas"), z.uuid("Representada inválida")]),
  ),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

const FUSO = "America/Sao_Paulo";
/** AAAA-MM-DD no fuso de Brasília. */
export const diaSP = (d: Date | string) => new Date(d).toLocaleDateString("sv-SE", { timeZone: FUSO });
/** AAAA-MM no fuso de Brasília. */
export const mesSP = (d: Date | string) => diaSP(d).slice(0, 7);

const somarMeses = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a!, m! - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const listaMeses = (primeiro: string, n: number) => Array.from({ length: n }, (_, i) => somarMeses(primeiro, i));
// Brasília: UTC−3 o ano todo (sem horário de verão desde 2019)
const inicioDoMes = (mes: string) => `${mes}-01T00:00:00-03:00`;

export type Janela = { meses: string[]; inicio: string; fim: string };

/**
 * Período atual (meses até o mês corrente) e o anterior equivalente:
 * 3m/6m/12m = N meses imediatamente antes; ano = mesmos meses do ano anterior (jan..mês atual).
 */
export function janelas(periodo: Periodo, agora: Date = new Date()): { atual: Janela; anterior: Janela } {
  const mesAtual = mesSP(agora);
  const n = periodo === "ano" ? Number(mesAtual.slice(5, 7)) : Number(periodo.replace("m", ""));
  const primeiro = periodo === "ano" ? `${mesAtual.slice(0, 4)}-01` : somarMeses(mesAtual, -(n - 1));
  const primeiroAnt = periodo === "ano" ? somarMeses(primeiro, -12) : somarMeses(primeiro, -n);
  const atual = { meses: listaMeses(primeiro, n), inicio: inicioDoMes(primeiro), fim: agora.toISOString() };
  const fimAnt = periodo === "ano" ? new Date(new Date(agora).setUTCFullYear(agora.getUTCFullYear() - 1)).toISOString() : atual.inicio;
  return { atual, anterior: { meses: listaMeses(primeiroAnt, n), inicio: inicioDoMes(primeiroAnt), fim: fimAnt } };
}

/** Instante (ISO) dentro da janela [inicio, fim). */
export const naJanela = (iso: string | null | undefined, j: Janela) => {
  if (!iso) return false;
  const t = Date.parse(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso);
  return t >= Date.parse(j.inicio) && t < Date.parse(j.fim) + 1;
};

/** Variação % vs período anterior (1 casa); sem base anterior: 0 se ambos zero, senão null. */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? 0 : null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

export const centavos = (v: number) => Math.round(v * 100) / 100;

/** Soma por chave (GROUP BY em memória sobre o resultado de uma única consulta). */
export function somarPor<T>(itens: T[], chave: (i: T) => string | null | undefined, valor: (i: T) => number): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of itens) {
    const k = chave(i);
    if (k) m.set(k, (m.get(k) ?? 0) + valor(i));
  }
  return m;
}

/** Série mensal completa (meses sem movimento entram com zero). */
export const serieMensal = (meses: string[], porMes: Map<string, number>) => meses.map((mes) => ({ mes, valor: centavos(porMes.get(mes) ?? 0) }));

/** Top N por valor (desc), com o nome resolvido. */
export function topN(porId: Map<string, number>, nomes: Map<string, string>, n = 5) {
  return [...porId.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, valor]) => ({ id, nome: nomes.get(id) ?? "—", valor: centavos(valor) }));
}
