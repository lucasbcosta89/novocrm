import { z } from "zod";
import { SIGLAS_UF } from "@/lib/ufs";

/** Listagem de representadas: filtros vindos da URL, com whitelist de ordenação (nada do cliente vira SQL). */

export const POR_PAGINA = 20;

/** Coluna exibida → coluna(s) da view representadas_listagem usadas na ordenação. */
export const ORDENACOES = {
  codigo: ["codigo_representada"],
  razao_social: ["razao_social"],
  cnpj: ["cnpj"],
  cidade_uf: ["uf", "cidade"],
  comissao: ["comissao_percentual"],
  status: ["status"],
  clientes: ["clientes_vinculados"],
  vendido_90d: ["valor_vendido_90d"],
} as const;
export type Ordenacao = keyof typeof ORDENACOES;

const umValor = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const opcional = <T extends z.ZodType, P extends z.infer<T> | null>(s: T, padrao: P) =>
  z.preprocess((v) => { const x = umValor(v); return x === "" || x == null ? undefined : x; }, s.optional().catch(undefined))
    .transform((v): z.infer<T> | P => (v === undefined ? padrao : (v as z.infer<T>)));

export const filtroRepresentadasSchema = z.object({
  q: z.preprocess((v) => String(umValor(v) ?? "").trim().slice(0, 60), z.string()),
  status: opcional(z.enum(["ativa", "inativa"]), null),
  uf: opcional(z.string().toUpperCase().refine((u) => SIGLAS_UF.includes(u)), null),
  ordem: opcional(z.enum(Object.keys(ORDENACOES) as [Ordenacao, ...Ordenacao[]]), "razao_social"),
  dir: opcional(z.enum(["asc", "desc"]), "asc"),
  pagina: opcional(z.coerce.number().int().min(1).max(100_000), 1),
});
export type FiltroRepresentadas = z.infer<typeof filtroRepresentadasSchema>;

/**
 * Termo de busca normalizado como a coluna `busca` (CNPJ guardado sem máscara):
 * termo só com dígitos e máscara de CNPJ (". / -") vira só dígitos; o resto vale como texto.
 */
export function termoBusca(q: string): string {
  const t = q.trim();
  return /\d/.test(t) && /^[\d.\-/\s]+$/.test(t) ? t.replace(/\D/g, "") : t;
}

/** Query string da listagem a partir do filtro (omitindo padrões), com sobrescritas. */
export function urlListagem(f: FiltroRepresentadas, mudar: Partial<FiltroRepresentadas> = {}, base = "/app/representadas"): string {
  const g = { ...f, ...mudar };
  const p = new URLSearchParams();
  if (g.q) p.set("q", g.q);
  if (g.status) p.set("status", g.status);
  if (g.uf) p.set("uf", g.uf);
  if (g.ordem !== "razao_social") p.set("ordem", g.ordem);
  if (g.dir !== "asc") p.set("dir", g.dir);
  if (g.pagina > 1) p.set("pagina", String(g.pagina));
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}
