import { lerJson, rota } from "@/server/rota";
import { criarVisita, listarVisitas } from "@/server/visitas";

type P = { id: string };

export const GET = rota<P>((ctx, { params }) => listarVisitas(ctx, params.id));
export const POST = rota<P>(async (ctx, { req, params }) => criarVisita(ctx, params.id, await lerJson(req)), 201);
