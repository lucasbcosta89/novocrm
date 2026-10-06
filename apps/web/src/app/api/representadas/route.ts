import { lerJson, rota } from "@/server/rota";
import { criarRepresentada, listarRepresentadas } from "@/server/representadas";

export const GET = rota((ctx) => listarRepresentadas(ctx));
export const POST = rota(async (ctx, { req }) => criarRepresentada(ctx, await lerJson(req)), 201);
