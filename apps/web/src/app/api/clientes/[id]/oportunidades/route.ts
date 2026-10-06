import { lerJson, rota } from "@/server/rota";
import { criarOportunidade, listarOportunidades } from "@/server/oportunidades";

type P = { id: string };

export const GET = rota<P>((ctx, { params }) => listarOportunidades(ctx, params.id));
export const POST = rota<P>(async (ctx, { req, params }) => criarOportunidade(ctx, params.id, await lerJson(req)), 201);
