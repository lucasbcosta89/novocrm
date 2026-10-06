import { lerJson, rota } from "@/server/rota";
import { atualizarOportunidade, excluirOportunidade, obterOportunidade } from "@/server/oportunidades";

type P = { id: string };

/** GET retorna a oportunidade com o plano de ação (acoes). */
export const GET = rota<P>((ctx, { params }) => obterOportunidade(ctx, params.id));
export const PATCH = rota<P>(async (ctx, { req, params }) => atualizarOportunidade(ctx, params.id, await lerJson(req)));
export const DELETE = rota<P>((ctx, { params }) => excluirOportunidade(ctx, params.id));
