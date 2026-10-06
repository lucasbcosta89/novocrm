import { lerJson, rota } from "@/server/rota";
import { criarProduto, listarProdutos } from "@/server/produtos";

type P = { id: string };

export const GET = rota<P>((ctx, { params }) => listarProdutos(ctx, params.id));
export const POST = rota<P>(async (ctx, { req, params }) => criarProduto(ctx, params.id, await lerJson(req)), 201);
