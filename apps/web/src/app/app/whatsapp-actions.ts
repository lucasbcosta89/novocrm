"use server";

import { headers } from "next/headers";
import { comParam } from "@/lib/url";
import { executarAcao } from "@/server/acao";
import type { Contexto } from "@/server/contexto";
import { erroBanco } from "@/server/erros";
import { enviarCatalogo, enviarConfirmacaoPedido, enviarFollowUp, type Envio } from "@/server/whatsapp";

async function origem() {
  const h = await headers();
  return h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

/** Envio pela Cloud API volta para a página com aviso; sem API, abre o WhatsApp (wa.me) com o texto pronto. */
async function enviarE(fn: (ctx: Contexto) => Promise<Envio>, voltar: string, mensagem: string) {
  let destino = voltar;
  await executarAcao(
    async (ctx) => {
      const envio = await fn(ctx);
      destino = envio.modo === "link" ? envio.url : comParam(voltar, "ok", mensagem);
      return envio;
    },
    { ok: () => destino, erro: voltar },
  );
}

export async function enviarCatalogoAction(representadaId: string, voltar: string, fd: FormData) {
  const clienteId = String(fd.get("cliente_id") ?? "");
  const o = await origem();
  await enviarE((ctx) => enviarCatalogo(ctx, clienteId, representadaId, o), voltar, "Catálogo enviado pelo WhatsApp");
}

export async function enviarCatalogoClienteAction(representadaId: string, clienteId: string) {
  const o = await origem();
  await enviarE((ctx) => enviarCatalogo(ctx, clienteId, representadaId, o), `/app/clientes/${clienteId}#representadas`, "Catálogo enviado pelo WhatsApp");
}

export async function followUpAction(tarefaId: string) {
  await enviarE((ctx) => enviarFollowUp(ctx, tarefaId), "/app", "Follow-up enviado pelo WhatsApp");
}

export async function confirmacaoPedidoAction(pedidoId: string) {
  await enviarE((ctx) => enviarConfirmacaoPedido(ctx.supabase, ctx.userId, pedidoId), `/app/pedidos/${pedidoId}`, "Confirmação enviada pelo WhatsApp");
}

export async function concluirTarefaAction(tarefaId: string) {
  await executarAcao(
    async ({ supabase }) => {
      const { error } = await supabase.from("tarefas").update({ concluida: true }).eq("id", tarefaId);
      if (error) throw erroBanco(error);
    },
    { ok: "/app", erro: "/app", mensagem: "Tarefa concluída" },
  );
}
