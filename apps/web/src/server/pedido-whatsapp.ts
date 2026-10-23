import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizarTelefone } from "@/lib/whatsapp";
import type { Contexto } from "./contexto";
import { pdfDoPedido } from "./documentos";
import { AppError } from "./erros";
import { dadosPedidoPdf } from "./pdf-pedido";

/**
 * Pedido em PDF por WhatsApp (Fase 12b, link wa.me): o representante baixa o PDF e anexa na conversa
 * aberta pelo wa.me. Aqui só se gera (ou reusa do cache por hash) o PDF e se registra o envio.
 * A Cloud API não é usada neste fluxo.
 */
export async function pdfParaEnvioWhatsApp(ctx: Contexto, pedidoId: string) {
  const pedido = await dadosPedidoPdf(ctx, pedidoId);
  if (!pedido.cliente) throw new AppError(400, "Pedido sem cliente", "validacao");
  const contato = normalizarTelefone(pedido.cliente.whatsapp ?? pedido.cliente.celular);
  if (!contato) throw new AppError(400, "Cliente sem telefone válido (DDD + número)", "validacao");

  const pdf = await pdfDoPedido(ctx, pedido.id);
  // histórico: data/hora (criado_em), pedido e telefone — gravado no clique que abre o wa.me
  const { error } = await supabaseAdmin().from("mensagens_whatsapp").insert({
    user_id: ctx.userId, cliente_id: pedido.cliente.id, direcao: "saida", contato, status: "link",
    conteudo: { tipo: "documento", via: "wa.me", pedido_id: pedido.id, numero: pedido.numero, documento_id: pdf.documentoId, arquivo: pdf.nome, cache: pdf.cache },
  });
  if (error) console.error("Registro de envio do pedido", error.message);
  return pdf;
}
