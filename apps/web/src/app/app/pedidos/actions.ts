"use server";

import { executarAcao } from "@/server/acao";
import { cancelarPedido, confirmarPedido, criarPedido, excluirPedido } from "@/server/pedidos";

const BASE = "/app/pedidos";

/** Itens vêm como qtd_<produtoId> / desc_<produtoId>; só entram os com quantidade > 0. */
function itensDoForm(fd: FormData) {
  const itens: { produto_id: string; quantidade: string; desconto: string }[] = [];
  for (const [chave, valor] of fd.entries()) {
    if (!chave.startsWith("qtd_") || typeof valor !== "string" || !(Number(valor.replace(",", ".")) > 0)) continue;
    const produto_id = chave.slice(4);
    const desconto = fd.get(`desc_${produto_id}`);
    itens.push({ produto_id, quantidade: valor, desconto: typeof desconto === "string" && desconto ? desconto : "0" });
  }
  return itens;
}

export async function criarPedidoAction(fd: FormData) {
  const representada_id = String(fd.get("representada_id") ?? "");
  const cliente_id = String(fd.get("cliente_id") ?? "");
  const confirmar = fd.get("confirmar") === "1";
  await executarAcao(
    (ctx) =>
      criarPedido(ctx, {
        representada_id,
        cliente_id,
        forma_pagamento: fd.get("forma_pagamento"),
        confirmar,
        itens: itensDoForm(fd),
      }),
    {
      ok: (p) => `${BASE}/${p.id}`,
      erro: `${BASE}/novo?representada=${representada_id}&cliente=${cliente_id}`,
      mensagem: confirmar ? "Pedido confirmado e comissão lançada" : "Rascunho salvo",
    },
  );
}

export async function confirmarPedidoAction(id: string) {
  await executarAcao((ctx) => confirmarPedido(ctx, id), {
    ok: `${BASE}/${id}`,
    erro: `${BASE}/${id}`,
    mensagem: "Pedido confirmado e comissão lançada",
  });
}

export async function cancelarPedidoAction(id: string) {
  await executarAcao((ctx) => cancelarPedido(ctx, id), { ok: `${BASE}/${id}`, erro: `${BASE}/${id}`, mensagem: "Pedido cancelado" });
}

export async function excluirPedidoAction(id: string, clienteId: string) {
  await executarAcao((ctx) => excluirPedido(ctx, id), {
    ok: `/app/clientes/${clienteId}#pedidos`,
    erro: `${BASE}/${id}`,
    mensagem: "Rascunho excluído",
  });
}
