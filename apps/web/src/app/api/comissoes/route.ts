import { rota } from "@/server/rota";
import { listarComissoes } from "@/server/comissoes";

/** Mesmos parâmetros da página (p, de, ate, campo, g, comp, mot, rep, cli, lote, ed, ord, dir, pag, visao) → lista + totais por grupo. */
export const GET = rota(async (ctx, { req }) => listarComissoes(ctx, Object.fromEntries(req.nextUrl.searchParams)));
