import { lerJson, rota } from "@/server/rota";
import { atualizarCliente, excluirCliente, obterCliente } from "@/server/clientes";

type P = { id: string };

export const GET = rota<P>((ctx, { params }) => obterCliente(ctx, params.id));
export const PATCH = rota<P>(async (ctx, { req, params }) => atualizarCliente(ctx, params.id, await lerJson(req)));
export const DELETE = rota<P>((ctx, { params }) => excluirCliente(ctx, params.id));
