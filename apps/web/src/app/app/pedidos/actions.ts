"use server";

import { executarAcao } from "@/server/acao";
import { cancelarPedido, confirmarPedido, criarPedido, editarPedido, excluirPedido } from "@/server/pedidos";

const BASE = "/app/pedidos";

/** Itens vêm como qtd_<produtoId> / desc_<produtoId> / acr_<produtoId> (desconto e acréscimo em %); só entram os com quantidade > 0. */
function itensDoForm(fd: FormData) {
  const itens: { produto_id: string; quantidade: string; desconto_percentual: string; acrescimo_percentual: string }[] = [];
  for (const [chave, valor] of fd.entries()) {
    if (!chave.startsWith("qtd_") || typeof valor !== "string" || !(Number(valor.replace(",", ".")) > 0)) continue;
    const produto_id = chave.slice(4);
    const desconto = fd.get(`desc_${produto_id}`);
    const acrescimo = fd.get(`acr_${produto_id}`);
    itens.push({
      produto_id, quantidade: valor,
      desconto_percentual: typeof desconto === "string" && desconto ? desconto : "0",
      acrescimo_percentual: typeof acrescimo === "string" && acrescimo ? acrescimo : "0",
    });
  }
  return itens;
}

/**
 * Fase 17.1 — itens SEM produto (componente ItensSemProduto): sp_<k>_desc (obrigatória), sp_<k>_sku, sp_<k>_qtd,
 * sp_<k>_preco, sp_<k>_descpct, sp_<k>_acr e sp_<k>_id (edição). A validação final é do Zod/banco.
 */
function itensSemProdutoDoForm(fd: FormData) {
  const chaves = new Set<string>();
  for (const k of fd.keys()) { const m = /^sp_(\w+)_desc$/.exec(k); if (m) chaves.add(m[1]!); }
  const v = (k: string, campo: string) => { const x = fd.get(`sp_${k}_${campo}`); return typeof x === "string" ? x : ""; };
  return [...chaves].map((k) => ({
    produto_id: null, item_id: v(k, "id") || null, descricao_informada: v(k, "desc"), sku_informado: v(k, "sku"),
    quantidade: v(k, "qtd"), preco_unitario: v(k, "preco"), desconto_percentual: v(k, "descpct") || "0", acrescimo_percentual: v(k, "acr") || "0",
  }));
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
        prazo_tipo: fd.get("prazo_tipo") ?? "a_vista",
        prazo_dias: fd.get("prazo_dias"),
        confirmar,
        gerar_codigo: fd.get("gerar_codigo") === "1",
        codigo_pedido: fd.get("codigo_pedido"),
        data_faturamento: fd.get("data_faturamento"),
        itens: [...itensDoForm(fd), ...itensSemProdutoDoForm(fd)],
      }),
    {
      ok: (p) => `${BASE}/${p.id}`,
      erro: `${BASE}/novo?representada=${representada_id}&cliente=${cliente_id}`,
      mensagem: confirmar ? "Pedido confirmado e comissão lançada" : "Rascunho salvo",
    },
  );
}

/** Edição: além de qtd_/desc_, cada item traz preco_<produtoId>. */
export async function editarPedidoAction(id: string, fd: FormData) {
  const itens = [
    ...itensDoForm(fd).map((i) => ({ ...i, preco_unitario: String(fd.get(`preco_${i.produto_id}`) ?? "") })),
    ...itensSemProdutoDoForm(fd),
  ];
  await executarAcao(
    (ctx) =>
      editarPedido(ctx, id, {
        forma_pagamento: fd.get("forma_pagamento"),
        prazo_tipo: fd.get("prazo_tipo") ?? "a_vista",
        prazo_dias: fd.get("prazo_dias"),
        codigo_pedido: fd.get("codigo_pedido"),
        data_faturamento: fd.get("data_faturamento"),
        itens,
      }),
    { ok: `${BASE}/${id}`, erro: `${BASE}/${id}/editar`, mensagem: "Pedido atualizado" },
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

/** voltar: página de origem (tabela de pedidos do cliente ou o próprio pedido); o erro volta para ela. */
export async function excluirPedidoAction(id: string, clienteId: string, voltar: string) {
  await executarAcao((ctx) => excluirPedido(ctx, id), {
    ok: `/app/clientes/${clienteId}/pedidos`,
    erro: voltar.startsWith("/app/") ? voltar : `${BASE}/${id}`,
    mensagem: "Pedido excluído",
  });
}
