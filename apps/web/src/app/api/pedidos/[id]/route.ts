import { rota } from "@/server/rota";
import { excluirPedido, obterPedido } from "@/server/pedidos";

type P = { id: string };

export const GET = rota<P>((ctx, { params }) => obterPedido(ctx, params.id));
export const DELETE = rota<P>((ctx, { params }) => excluirPedido(ctx, params.id));
