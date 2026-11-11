import { z } from "zod";

/** Dashboard principal (Fase 9-1): parâmetros, períodos e agregações puras (sem acesso ao banco). */
export const PERIODOS = ["mes", "30d", "personalizado"] as const;
export type Periodo = (typeof PERIODOS)[number];
export const ROTULO_PERIODO: Record<Periodo, string> = { mes: "Esse mês", "30d": "30 dias", personalizado: "Personalizado" };

/** Maior intervalo do período personalizado (consultas limitadas). */
export const MAX_DIAS_PERSONALIZADO = 731;

const dataIso = z.preprocess(
  (v) => (v == null || v === "" ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD)").refine((d) => !Number.isNaN(Date.parse(d)), "Data inválida").nullable(),
);

export const dashboardQuerySchema = z
  .object({
    periodo: z.preprocess((v) => (v == null || v === "" ? "mes" : v), z.enum(PERIODOS, "Período inválido (mes, 30d ou personalizado)")),
    de: dataIso.optional(),
    ate: dataIso.optional(),
    representada_id: z.preprocess(
      (v) => (v == null || v === "" ? "todas" : v),
      z.union([z.literal("todas"), z.uuid("Representada inválida")]),
    ),
  })
  .superRefine((q, ctx) => {
    if (q.periodo !== "personalizado") return;
    if (!q.de || !q.ate) ctx.addIssue({ code: "custom", message: "Informe a data inicial e a final do período personalizado", path: ["de"] });
    else if (diasEntre(q.de > q.ate ? q.ate : q.de, q.de > q.ate ? q.de : q.ate) > MAX_DIAS_PERSONALIZADO) {
      ctx.addIssue({ code: "custom", message: "Período personalizado de no máximo 2 anos", path: ["ate"] });
    }
  })
  // só o personalizado usa datas; datas invertidas são trocadas
  .transform((q) => {
    if (q.periodo !== "personalizado") return { periodo: q.periodo, representada_id: q.representada_id, de: null, ate: null };
    const [de, ate] = q.de! <= q.ate! ? [q.de!, q.ate!] : [q.ate!, q.de!];
    return { periodo: q.periodo, representada_id: q.representada_id, de, ate };
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
export const somarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000) + 1;
const listaDias = (primeiro: string, n: number) => Array.from({ length: n }, (_, i) => somarDias(primeiro, i));
const listaMesesEntre = (de: string, ate: string) => {
  const meses: string[] = [];
  for (let m = de.slice(0, 7); m <= ate.slice(0, 7); m = somarMeses(m, 1)) meses.push(m);
  return meses;
};
// Brasília: UTC−3 o ano todo (sem horário de verão desde 2019)
const inicioDoDia = (dia: string) => `${dia}T00:00:00-03:00`;

/** Mês anterior a "AAAA-MM". */
export const mesAnteriorDe = (mes: string) => somarMeses(mes, -1);

/** Janela [inicio, fim) e os pontos dos gráficos: por dia (até ~2 meses) ou por mês (intervalos maiores). */
export type Janela = { inicio: string; fim: string; granularidade: "dia" | "mes"; pontos: string[] };

/** Até este número de dias os gráficos ficam por dia; acima, por mês. */
const DIAS_GRAFICO_DIARIO = 62;

const janela = (de: string, ate: string): Janela => {
  const n = diasEntre(de, ate);
  const granularidade = n <= DIAS_GRAFICO_DIARIO ? "dia" : "mes";
  return { inicio: inicioDoDia(de), fim: inicioDoDia(somarDias(ate, 1)), granularidade, pontos: granularidade === "dia" ? listaDias(de, n) : listaMesesEntre(de, ate) };
};

/**
 * Período atual e o anterior (para a variação dos KPIs):
 *  - "mes": mês corrente inteiro (inclui comissões previstas e despesas até o fim do mês) × mês anterior inteiro;
 *  - "30d": últimos 30 dias até hoje × os 30 dias imediatamente antes;
 *  - "personalizado": de..até (inclusive) × o mesmo número de dias imediatamente antes.
 */
export function janelas(q: Pick<DashboardQuery, "periodo" | "de" | "ate">, agora: Date = new Date()): { atual: Janela; anterior: Janela } {
  const hoje = diaSP(agora);
  if (q.periodo === "mes") {
    const primeiro = `${hoje.slice(0, 7)}-01`;
    const ultimo = somarDias(`${somarMeses(hoje.slice(0, 7), 1)}-01`, -1);
    const primeiroAnt = `${mesAnteriorDe(hoje.slice(0, 7))}-01`;
    return { atual: janela(primeiro, ultimo), anterior: janela(primeiroAnt, somarDias(primeiro, -1)) };
  }
  const [de, ate] = q.periodo === "30d" ? [somarDias(hoje, -29), hoje] : [q.de!, q.ate!];
  const n = diasEntre(de, ate);
  return { atual: janela(de, ate), anterior: janela(somarDias(de, -n), somarDias(de, -1)) };
}

/** Ponto do gráfico de um instante (ISO) ou data (AAAA-MM-DD): o dia ou o mês, em Brasília. */
export const pontoDe = (iso: string, granularidade: Janela["granularidade"]) =>
  (iso.length === 10 ? iso : diaSP(iso)).slice(0, granularidade === "dia" ? 10 : 7);

/** Instante (ISO) ou data (AAAA-MM-DD, meio-dia em Brasília) dentro da janela [inicio, fim). */
export const naJanela = (iso: string | null | undefined, j: Janela) => {
  if (!iso) return false;
  const t = Date.parse(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso);
  return t >= Date.parse(j.inicio) && t < Date.parse(j.fim);
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

/** Série completa dos pontos do período (dias ou meses sem movimento entram com zero). */
export const serie = (pontos: string[], porPonto: Map<string, number>) => pontos.map((ponto) => ({ ponto, valor: centavos(porPonto.get(ponto) ?? 0) }));

/** Top N por valor (desc), com o nome resolvido. */
export function topN(porId: Map<string, number>, nomes: Map<string, string>, n = 5) {
  return [...porId.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, valor]) => ({ id, nome: nomes.get(id) ?? "—", valor: centavos(valor) }));
}
