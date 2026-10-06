import { lerJson, rota } from "@/server/rota";
import { atualizarAcao, excluirAcao } from "@/server/oportunidades";

type P = { id: string };

export const PATCH = rota<P>(async (ctx, { req, params }) => atualizarAcao(ctx, params.id, await lerJson(req)));
export const DELETE = rota<P>((ctx, { params }) => excluirAcao(ctx, params.id));
