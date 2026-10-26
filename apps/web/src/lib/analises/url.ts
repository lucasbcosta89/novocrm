import { METRICAS } from "./catalogo";
import { resolverPeriodo, type PeriodoPreset } from "./presets";
import type { FiltrosSpec, Granularidade, MetricaId, Periodo } from "./tipos";

/**
 * Filtros globais na query string (valem para todas as abas e sobrevivem à troca de aba):
 * p, de, ate, rep, cli, prod, st, uf, canal (listas separadas por vírgula), gran.
 */
export interface EstadoGlobal { preset: PeriodoPreset; periodo: Periodo; filtros: FiltrosSpec; granularidade: Granularidade }

const CHAVES = { representada_id: "rep", cliente_id: "cli", produto_id: "prod", status: "st", uf: "uf", canal: "canal" } as const;

type Leitor = { get(nome: string): string | null };
const lista = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

export function lerEstado(q: Leitor, agora = new Date()): EstadoGlobal {
  const { preset, periodo } = resolverPeriodo(q.get("p"), q.get("de"), q.get("ate"), agora);
  const filtros = Object.fromEntries(Object.entries(CHAVES).map(([campo, chave]) => [campo, lista(q.get(chave))])) as unknown as FiltrosSpec;
  return { preset, periodo, filtros, granularidade: q.get("gran") === "pedidos" ? "pedidos" : "itens" };
}

export function escreverEstado(e: EstadoGlobal): string {
  const q = new URLSearchParams();
  if (e.preset !== "90d") q.set("p", e.preset);
  if (e.preset === "personalizado") { q.set("de", e.periodo.de); q.set("ate", e.periodo.ate); }
  for (const [campo, chave] of Object.entries(CHAVES)) {
    const v = e.filtros[campo as keyof FiltrosSpec];
    if (v.length) q.set(chave, v.join(","));
  }
  if (e.granularidade === "pedidos") q.set("gran", "pedidos");
  return q.toString();
}

export const quantosFiltros = (f: FiltrosSpec) => Object.values(f).reduce((n, v) => n + (v.length ? 1 : 0), 0);

/* ---------- Formatação de valores ---------- */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = (casas: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas });
const pct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatarMetrica(m: MetricaId, v: number | string | null | undefined): string {
  if (v == null || v === "") return "—";
  const def = METRICAS[m];
  if (def.unidade === "texto") return String(v);
  if (def.unidade === "data") return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const s = def.unidade === "brl" ? brl.format(n)
    : def.unidade === "percentual" ? `${pct.format(n)}%`
    : def.unidade === "pp" ? `${n > 0 ? "+" : ""}${pct.format(n)} p.p.`
    : def.unidade === "dias" ? `${num(0).format(n)} d`
    : num(def.casas ?? 0).format(n);
  return s.replace(/\u00a0/g, " ");
}

/** Variação % entre atual e anterior (null quando não há base). */
export const variacao = (atual: number | null | undefined, anterior: number | null | undefined) =>
  atual == null || anterior == null || Number(anterior) === 0 ? null : Math.round(((Number(atual) - Number(anterior)) / Math.abs(Number(anterior))) * 1000) / 10;
