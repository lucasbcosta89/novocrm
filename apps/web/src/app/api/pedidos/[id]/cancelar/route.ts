import { rota } from "@/server/rota";
import { cancelarPedido } from "@/server/pedidos";

export const POST = rota<{ id: string }>((ctx, { params }) => cancelarPedido(ctx, params.id));
