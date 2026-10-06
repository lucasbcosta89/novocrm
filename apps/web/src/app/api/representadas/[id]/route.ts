import { lerJson, rota } from "@/server/rota";
import { atualizarRepresentada, excluirRepresentada, obterRepresentada } from "@/server/representadas";

type P = { id: string };

export const GET = rota<P>((ctx, { params }) => obterRepresentada(ctx, params.id));
export const PATCH = rota<P>(async (ctx, { req, params }) => atualizarRepresentada(ctx, params.id, await lerJson(req)));
export const DELETE = rota<P>((ctx, { params }) => excluirRepresentada(ctx, params.id));
