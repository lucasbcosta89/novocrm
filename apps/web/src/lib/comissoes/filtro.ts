import { z } from "zod";
import { ATALHOS_COMISSOES, resolverPeriodo } from "@/lib/custos";
import { COMPLETUDES, GRUPOS_STATUS, MOTIVOS_PENDENCIA, type GrupoStatus } from "./status";

/**
 * Fase 21 (P) — filtro da página de Comissões, persistido na URL (sobrevive ao reload, à paginação, à ordenação e às
 * ações). Aplica-se à LISTA e aos TOTAIS (nunca só à página visível). Período = o mesmo resolvedor de Custos.
 */
export const CAMPOS_DATA = ["previsao", "pedido", "faturamento", "recebimento", "sem_previsao"] as const;
export type CampoData = (typeof CAMPOS_DATA)[number];
export const ROTULOS_CAMPO_DATA: Record<CampoData, string> = {
  previsao: "Previsão de recebimento", pedido: "Data do pedido", faturamento: "Data de faturamento", recebimento: "Data de recebimento",
  sem_previsao: "Sem previsão",
};
export const ORDENS = ["previsao", "pedido", "valor"] as const;
export const VISOES = ["lista", "analise", "lotes"] as const;
export const POR_PAGINA = 50;

const lista = <T extends readonly [string, ...string[]]>(valores: T) =>
  z.preprocess((v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : String(v).split(",")), z.array(z.enum(valores)).catch([]));
const uuidLista = z.preprocess((v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : String(v).split(",")), z.array(z.string().uuid()).catch([]));
const um = (v: unknown) => (Array.isArray(v) ? v[0] : v);

export const filtroComissoesSchema = z.object({
  p: z.preprocess(um, z.enum(ATALHOS_COMISSOES).catch("este_mes")).default("este_mes"),
  de: z.preprocess(um, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined)),
  ate: z.preprocess(um, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined)),
  campo: z.preprocess(um, z.enum(CAMPOS_DATA).catch("previsao")).default("previsao"),
  g: lista(GRUPOS_STATUS as unknown as readonly [GrupoStatus, ...GrupoStatus[]]),
  comp: z.preprocess(um, z.enum(COMPLETUDES).optional().catch(undefined)),
  mot: z.preprocess(um, z.enum(MOTIVOS_PENDENCIA).optional().catch(undefined)),
  rep: uuidLista,
  cli: uuidLista,
  lote: z.preprocess((v) => um(v) === "1", z.boolean()).default(false),
  ed: z.preprocess((v) => um(v) === "1", z.boolean()).default(false),
  ord: z.preprocess(um, z.enum(ORDENS).catch("previsao")).default("previsao"),
  dir: z.preprocess(um, z.enum(["asc", "desc"]).catch("asc")).default("asc"),
  pag: z.preprocess((v) => Number(um(v)) || 1, z.number().int().min(1).max(10_000)).default(1),
  visao: z.preprocess(um, z.enum(VISOES).catch("lista")).default("lista"),
});
export type FiltroComissoes = z.infer<typeof filtroComissoesSchema>;

export const lerFiltroComissoes = (sp: Record<string, unknown>) => filtroComissoesSchema.parse(sp);

/** Intervalo do período (datas inclusivas); "Sem previsão" ignora o período. */
export function periodoDoFiltro(f: FiltroComissoes, hoje: string) {
  return resolverPeriodo(f.p, f.de, f.ate, hoje);
}

/** Filtros complementares ativos (chip "N filtros"). Período/campo padrão e paginação não contam. */
export function contarFiltrosAtivos(f: FiltroComissoes): number {
  return [f.p !== "este_mes", f.campo !== "previsao", f.g.length > 0, !!f.comp, !!f.mot, f.rep.length > 0, f.cli.length > 0, f.lote, f.ed].filter(Boolean).length;
}

/**
 * Assinatura do FILTRO (sem paginação/ordem/visão): a seleção da aprovação em lote vale só para ela — mudar qualquer
 * filtro troca a assinatura e limpa a seleção; paginar e ordenar não.
 */
export function assinaturaFiltro(f: FiltroComissoes): string {
  return JSON.stringify([f.p, f.p === "personalizado" ? f.de : "", f.p === "personalizado" ? f.ate : "", f.campo, [...f.g].sort(), f.comp ?? "", f.mot ?? "",
    [...f.rep].sort(), [...f.cli].sort(), f.lote, f.ed, f.visao]);
}

/** URL da página com o filtro (+ alterações). Valores padrão não vão para a URL. */
export function urlComissoes(f: FiltroComissoes, mudar: Partial<Record<keyof FiltroComissoes, unknown>> = {}, base = "/app/comissoes"): string {
  const v = { ...f, ...mudar } as FiltroComissoes;
  const qs = new URLSearchParams();
  if (v.p !== "este_mes") qs.set("p", v.p);
  if (v.p === "personalizado") { if (v.de) qs.set("de", v.de); if (v.ate) qs.set("ate", v.ate); }
  if (v.campo !== "previsao") qs.set("campo", v.campo);
  if (v.g.length) qs.set("g", v.g.join(","));
  if (v.comp) qs.set("comp", v.comp);
  if (v.mot) qs.set("mot", v.mot);
  if (v.rep.length) qs.set("rep", v.rep.join(","));
  if (v.cli.length) qs.set("cli", v.cli.join(","));
  if (v.lote) qs.set("lote", "1");
  if (v.ed) qs.set("ed", "1");
  if (v.ord !== "previsao") qs.set("ord", v.ord);
  if (v.dir !== "asc") qs.set("dir", v.dir);
  if (v.pag > 1) qs.set("pag", String(v.pag));
  if (v.visao !== "lista") qs.set("visao", v.visao);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
