"use server";

import { executarAcao } from "@/server/acao";
import { excluirDevolucao, salvarDevolucao } from "@/server/devolucoes";

const base = (clienteId: string) => `/app/clientes/${clienteId}/devolucoes`;

/** Itens: qtd_/preco_/desc_<produtoId> (mesmo formulário da edição de pedido); só entram os com quantidade > 0. */
function itensDoForm(fd: FormData) {
  const itens: { produto_id: string; quantidade: string; preco_unitario: string; desconto_percentual: string }[] = [];
  for (const [chave, valor] of fd.entries()) {
    if (!chave.startsWith("qtd_") || typeof valor !== "string" || !(Number(valor.replace(",", ".")) > 0)) continue;
    const produto_id = chave.slice(4);
    const desconto = fd.get(`desc_${produto_id}`);
    itens.push({
      produto_id,
      quantidade: valor,
      preco_unitario: String(fd.get(`preco_${produto_id}`) ?? ""),
      desconto_percentual: typeof desconto === "string" && desconto ? desconto : "0",
    });
  }
  return itens;
}

const dados = (clienteId: string, fd: FormData) => ({
  cliente_id: clienteId,
  representada_id: fd.get("representada_id"),
  pedido_id: fd.get("pedido_id"),
  data: fd.get("data"),
  motivo: fd.get("motivo"),
  status: fd.get("status") ?? "pendente",
  forma_pagamento: fd.get("forma_pagamento"),
  prazo_tipo: fd.get("prazo_tipo") ?? "a_vista",
  prazo_dias: fd.get("prazo_dias"),
  observacoes: fd.get("observacoes"),
  itens: itensDoForm(fd),
});

/** voltar: URL do formulário (mantém representada/pedido escolhidos quando há erro). */
export async function salvarDevolucaoAction(clienteId: string, devolucaoId: string | null, voltar: string, fd: FormData) {
  await executarAcao((ctx) => salvarDevolucao(ctx, devolucaoId, dados(clienteId, fd)), {
    ok: base(clienteId),
    erro: voltar.startsWith("/app/") ? voltar : base(clienteId),
    mensagem: devolucaoId ? "Devolução atualizada" : "Devolução registrada",
  });
}

export async function excluirDevolucaoAction(clienteId: string, devolucaoId: string) {
  await executarAcao((ctx) => excluirDevolucao(ctx, devolucaoId), { ok: base(clienteId), erro: base(clienteId), mensagem: "Devolução excluída" });
}
