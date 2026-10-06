import { lerJson, rota } from "@/server/rota";
import { criarAcao } from "@/server/oportunidades";

export const POST = rota<{ id: string }>(async (ctx, { req, params }) => criarAcao(ctx, params.id, await lerJson(req)), 201);
