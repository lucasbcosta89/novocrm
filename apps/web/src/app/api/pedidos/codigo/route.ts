import { codigoPedidoDisponivel } from "@/server/pedidos";
import { rota } from "@/server/rota";

/** GET ?codigo=&ignorar=<pedidoId> — o código do pedido está livre para este usuário? (Fase 14) */
export const GET = rota(async (ctx, { req }) => {
  const sp = req.nextUrl.searchParams;
  return codigoPedidoDisponivel(ctx, { codigo: sp.get("codigo") ?? "", ignorar: sp.get("ignorar") || null });
});
