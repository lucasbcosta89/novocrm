import { idSchema, pedidoSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

export type PedidoItem = {
  id: string;
  produto_id: string | null;
  descricao: string | null;
  quantidade: number;
  preco_unitario: number;
  desconto: number;
  subtotal: number;
  comissao_percentual: number;
  comissao_valor: number;
  produto: { sku: string } | null;
};

export type Pedido = {
  id: string;
  numero: string;
  data: string;
  status: string;
  valor_total: number;
  comissao_total: number;
  forma_pagamento: string | null;
  origem: string;
  observacoes: string | null;
  cliente: { id: string; nome: string } | null;
  representada: { id: string; nome: string } | null;
  itens: PedidoItem[];
  comissao: { id: string; status: string; valor: number; percentual: number; data_prevista: string | null }[];
};

const CAMPOS = `id, numero, data, status, valor_total, comissao_total, forma_pagamento, origem, observacoes,
  cliente:clientes(id, nome), representada:representadas(id, nome),
  itens:pedido_itens(id, produto_id, descricao, quantidade, preco_unitario, desconto, subtotal, comissao_percentual, comissao_valor, produto:produtos(sku)),
  comissao:comissoes(id, status, valor, percentual, data_prevista)`;

export async function obterPedido({ supabase }: Contexto, id: string): Promise<Pedido> {
  const { data, error } = await supabase.from("pedidos").select(CAMPOS).eq("id", idSchema.parse(id)).single<Pedido>();
  if (error) throw erroBanco(error);
  return data;
}

/** Cria pedido de forma atômica (função SQL criar_pedido); preço e comissão vêm do banco, nunca do cliente. */
export async function criarPedido(ctx: Contexto, input: unknown): Promise<Pedido> {
  const p = pedidoSchema.parse(input);
  const { data, error } = await ctx.supabase.rpc("criar_pedido", {
    p_representada_id: p.representada_id,
    p_cliente_id: p.cliente_id,
    p_itens: p.itens,
    p_forma_pagamento: p.forma_pagamento ?? null,
    p_confirmar: p.confirmar,
  });
  if (error) throw erroBanco(error, "Número de pedido em uso; tente novamente");
  return obterPedido(ctx, data as string);
}

/** Confirma rascunho: grava snapshot de comissão por item e a linha em comissoes. */
export async function confirmarPedido(ctx: Contexto, id: string): Promise<Pedido> {
  const { error } = await ctx.supabase.rpc("confirmar_pedido", { p_pedido_id: idSchema.parse(id) });
  if (error) throw erroBanco(error);
  return obterPedido(ctx, id);
}

export async function cancelarPedido(ctx: Contexto, id: string): Promise<Pedido> {
  const { error } = await ctx.supabase.rpc("cancelar_pedido", { p_pedido_id: idSchema.parse(id) });
  if (error) throw erroBanco(error);
  return obterPedido(ctx, id);
}

/** Só rascunhos podem ser excluídos; confirmados devem ser cancelados. */
export async function excluirPedido({ supabase }: Contexto, id: string): Promise<void> {
  const { error, count } = await supabase
    .from("pedidos")
    .delete({ count: "exact" })
    .eq("id", idSchema.parse(id))
    .eq("status", "rascunho");
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(400, "Só pedidos em rascunho podem ser excluídos", "regra");
}
