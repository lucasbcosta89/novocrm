import { z } from "zod";
import { idSchema } from "@/lib/validacao";
import { lerJson, rota } from "@/server/rota";
import { enviarCatalogo, enviarConfirmacaoPedido, enviarFollowUp, enviarTexto } from "@/server/whatsapp";

const schema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("catalogo"), cliente_id: idSchema, representada_id: idSchema }),
  z.object({ acao: z.literal("follow_up"), tarefa_id: idSchema }),
  z.object({ acao: z.literal("confirmacao_pedido"), pedido_id: idSchema }),
  z.object({ acao: z.literal("texto"), cliente_id: idSchema, texto: z.string().trim().min(1).max(4000) }),
]);

/** → { modo: "api", mensagemId } (Cloud API) | { modo: "link", url } (wa.me, quando a Meta não está configurada). */
export const POST = rota(async (ctx, { req }) => {
  const b = schema.parse(await lerJson(req));
  switch (b.acao) {
    case "catalogo":
      return enviarCatalogo(ctx, b.cliente_id, b.representada_id, req.nextUrl.origin);
    case "follow_up":
      return enviarFollowUp(ctx, b.tarefa_id);
    case "confirmacao_pedido":
      return enviarConfirmacaoPedido(ctx.supabase, ctx.userId, b.pedido_id);
    case "texto":
      return enviarTexto(ctx, b.cliente_id, b.texto);
  }
});
