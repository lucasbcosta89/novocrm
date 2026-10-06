import { lerJson, rota } from "@/server/rota";
import { atualizarProduto, excluirProduto, obterProduto } from "@/server/produtos";

type P = { id: string };

export const GET = rota<P>((ctx, { params }) => obterProduto(ctx, params.id));
export const PATCH = rota<P>(async (ctx, { req, params }) => atualizarProduto(ctx, params.id, await lerJson(req)));
export const DELETE = rota<P>((ctx, { params }) => excluirProduto(ctx, params.id));
