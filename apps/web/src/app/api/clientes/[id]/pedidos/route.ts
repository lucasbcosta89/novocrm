import { rota } from "@/server/rota";
import { listarPedidos } from "@/server/consultas";

export const GET = rota<{ id: string }>((ctx, { params }) => listarPedidos(ctx, { cliente_id: params.id }));
