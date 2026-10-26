import { listarVisoes, salvarVisao } from "@/server/analises";
import { lerJson, rota } from "@/server/rota";

/** GET ?aba= — visões da aba + compartilhadas. POST — salva { aba, nome, escopo, spec }. */
export const GET = rota(async (ctx, { req }) => listarVisoes(ctx, req.nextUrl.searchParams.get("aba") ?? ""));
export const POST = rota(async (ctx, { req }) => salvarVisao(ctx, await lerJson(req)), 201);
