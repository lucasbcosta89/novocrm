import { rota } from "@/server/rota";
import { confirmarPedido } from "@/server/pedidos";

export const POST = rota<{ id: string }>((ctx, { params }) => confirmarPedido(ctx, params.id));
