import { lerJson, rota } from "@/server/rota";
import { atualizarVisita, excluirVisita, obterVisita } from "@/server/visitas";

type P = { id: string };

export const GET = rota<P>((ctx, { params }) => obterVisita(ctx, params.id));
export const PATCH = rota<P>(async (ctx, { req, params }) => atualizarVisita(ctx, params.id, await lerJson(req)));
export const DELETE = rota<P>((ctx, { params }) => excluirVisita(ctx, params.id));
