import { z } from "zod";

/** Controle de custos (Fase 11): validação, períodos e agrupamento (funções puras, testáveis). */

/** "1.234,56" | "1234,56" | "1234.56" | 1234.56 → número. */
export function valorBRL(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.replace(/[R$\s]/g, "");
  if (t === "") return Number.NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
}

const vazioParaNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const listaIds = z.preprocess(
  (v) => (v == null ? [] : Array.isArray(v) ? v : [v]),
  z.array(z.uuid("Seleção inválida")).max(200).refine((xs) => new Set(xs).size === xs.length, "Item repetido"),
);

export const despesaSchema = z.object({
  descricao: z.string().trim().min(1, "Informe a descrição").max(200, "Descrição muito longa (máx. 200)"),
  data: z.iso.date("Informe a data"),
  valor: z.preprocess(valorBRL, z.number("Informe o valor").min(0, "O valor não pode ser negativo").max(9_999_999_999, "Valor muito alto")),
  observacoes: z.preprocess(vazioParaNull, z.string().trim().max(2000).nullable().optional()),
  representadas: listaIds.default([]),
  clientes: listaIds.default([]),
});
export type DespesaInput = z.infer<typeof despesaSchema>;

/* ---------- Período ---------- */

export const ATALHOS = ["este_mes", "mes_passado", "3m", "6m", "12m", "ano", "personalizado"] as const;
export type Atalho = (typeof ATALHOS)[number];
export const ROTULO_ATALHO: Record<Atalho, string> = {
  este_mes: "Este mês", mes_passado: "Mês passado", "3m": "Últimos 3 meses", "6m": "Últimos 6 meses",
  "12m": "Últimos 12 meses", ano: "Este ano", personalizado: "Personalizado",
};

const DIA = 86_400_000;
const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const primeiroDoMes = (iso: string, deslocar = 0) => {
  const [a, m] = iso.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(a, m - 1 + deslocar, 1)).toISOString().slice(0, 10);
};
const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dataValida = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/**
 * Intervalo [de, ate] (datas inclusivas) do filtro. hoje = AAAA-MM-DD (Brasília).
 * "personalizado" usa de/ate informados; se inválidos, cai em "este mês".
 */
export function resolverPeriodo(atalho: string | null | undefined, de: string | null | undefined, ate: string | null | undefined, hoje: string) {
  const a: Atalho = (ATALHOS as readonly string[]).includes(atalho ?? "") ? (atalho as Atalho) : "este_mes";
  let r: { de: string; ate: string };
  switch (a) {
    case "mes_passado": r = { de: primeiroDoMes(hoje, -1), ate: somarDias(primeiroDoMes(hoje), -1) }; break;
    case "3m": r = { de: primeiroDoMes(hoje, -2), ate: hoje }; break;
    case "6m": r = { de: primeiroDoMes(hoje, -5), ate: hoje }; break;
    case "12m": r = { de: primeiroDoMes(hoje, -11), ate: hoje }; break;
    case "ano": r = { de: `${hoje.slice(0, 4)}-01-01`, ate: hoje }; break;
    case "personalizado":
      if (dataValida(de) && dataValida(ate) && de <= ate) return { atalho: a, de, ate, rotulo: `${ddmmaaaa(de)} a ${ddmmaaaa(ate)}` };
      return resolverPeriodo("este_mes", null, null, hoje);
    default: r = { de: primeiroDoMes(hoje), ate: somarDias(primeiroDoMes(hoje, 1), -1) };
  }
  return { atalho: a, ...r, rotulo: a === "este_mes" || a === "mes_passado" ? ROTULO_ATALHO[a] : `${ROTULO_ATALHO[a]} (${ddmmaaaa(r.de)} a ${ddmmaaaa(r.ate)})` };
}

/* ---------- Agrupamento ---------- */

export const AGRUPAMENTOS = ["nenhum", "mes", "semana", "dia", "representada", "cliente"] as const;
export type Agrupamento = (typeof AGRUPAMENTOS)[number];
export const ROTULO_AGRUPAMENTO: Record<Agrupamento, string> = {
  nenhum: "Sem agrupamento", mes: "Data — mês", semana: "Data — semana", dia: "Data — dia", representada: "Representada", cliente: "Cliente",
};

export type DespesaLinha = {
  id: string; descricao: string; data: string; valor: number; observacoes: string | null;
  representadas: { id: string; nome: string }[];
  clientes: { id: string; nome: string }[];
};
export type Grupo = { chave: string; rotulo: string; despesas: DespesaLinha[]; subtotal: number };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** Segunda-feira da semana da data. */
const inicioSemana = (iso: string) => {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return somarDias(iso, dia === 0 ? -6 : 1 - dia);
};
const cent = (v: number) => Math.round(v * 100) / 100;

/** Total geral: cada despesa conta UMA vez, mesmo aparecendo em vários grupos. */
export const totalDistinto = (ds: DespesaLinha[]) => cent([...new Map(ds.map((d) => [d.id, Number(d.valor)])).values()].reduce((s, v) => s + v, 0));

/**
 * Grupos com subtotal. Por representada/cliente, a despesa com vários vínculos entra em cada grupo
 * (o subtotal do grupo conta o valor cheio); sem vínculo → "Sem representada"/"Sem cliente".
 */
export function agruparDespesas(ds: DespesaLinha[], modo: Agrupamento): Grupo[] {
  if (modo === "nenhum") return [{ chave: "todas", rotulo: "Todas", despesas: ds, subtotal: totalDistinto(ds) }];
  const grupos = new Map<string, Grupo>();
  const incluir = (chave: string, rotulo: string, d: DespesaLinha) => {
    const g = grupos.get(chave) ?? { chave, rotulo, despesas: [], subtotal: 0 };
    g.despesas.push(d);
    g.subtotal = cent(g.subtotal + Number(d.valor));
    grupos.set(chave, g);
  };
  for (const d of ds) {
    if (modo === "mes") incluir(d.data.slice(0, 7), `${MESES[Number(d.data.slice(5, 7)) - 1]}/${d.data.slice(0, 4)}`, d);
    else if (modo === "semana") { const s = inicioSemana(d.data); incluir(s, `Semana de ${ddmmaaaa(s)}`, d); }
    else if (modo === "dia") incluir(d.data, ddmmaaaa(d.data), d);
    else {
      const vinculos = modo === "representada" ? d.representadas : d.clientes;
      if (vinculos.length === 0) incluir("~sem", modo === "representada" ? "Sem representada" : "Sem cliente", d);
      for (const v of vinculos) incluir(v.id, v.nome, d);
    }
  }
  const lista = [...grupos.values()];
  // datas: mais recente primeiro; nomes: ordem alfabética (sem vínculo por último)
  return modo === "representada" || modo === "cliente"
    ? lista.sort((a, b) => (a.chave === "~sem" ? 1 : b.chave === "~sem" ? -1 : a.rotulo.localeCompare(b.rotulo, "pt-BR")))
    : lista.sort((a, b) => b.chave.localeCompare(a.chave));
}
