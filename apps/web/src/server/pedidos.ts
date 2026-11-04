import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { edicaoPedidoSchema, idSchema, pedidoSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

export type PedidoItem = {
  id: string;
  produto_id: string | null;
  descricao: string | null;
  quantidade: number;
  preco_unitario: number;
  desconto_percentual: number;
  desconto_acima_max: boolean;
  subtotal: number;
  comissao_percentual: number;
  comissao_valor: number;
  produto: { sku: string } | null;
  /** Fase 17: SKU como veio da planilha e pendência do item (produto não cadastrado / preço divergente) */
  sku_planilha: string | null;
  pendencia: "produto_nao_cadastrado" | "preco_divergente" | null;
};

export type Pedido = {
  id: string;
  numero: string;
  codigo_pedido: string;
  codigo_gerado: boolean;
  tem_pendencias: boolean;
  data: string;
  status: string;
  valor_total: number;
  comissao_total: number;
  forma_pagamento: string | null;
  prazo_tipo: string;
  prazo_dias: number | null;
  origem: string;
  observacoes: string | null;
  cliente: { id: string; nome: string } | null;
  representada: { id: string; nome: string } | null;
  itens: PedidoItem[];
  comissao: { id: string; status: string; valor: number; percentual: number; data_prevista: string | null }[];
};

const CAMPOS = `id, numero, codigo_pedido, codigo_gerado, tem_pendencias, data, status, valor_total, comissao_total, forma_pagamento, prazo_tipo, prazo_dias, origem, observacoes,
  cliente:clientes(id, nome), representada:representadas(id, nome:razao_social),
  itens:pedido_itens(id, produto_id, descricao, quantidade, preco_unitario, desconto_percentual, desconto_acima_max, subtotal, comissao_percentual, comissao_valor, sku_planilha, pendencia, produto:produtos(sku)),
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
    p_prazo_tipo: p.prazo_tipo,
    p_prazo_dias: p.prazo_dias,
    p_codigo: p.codigo_pedido,
  });
  if (error) throw erroPedido(error, "Número de pedido em uso; tente novamente");
  return obterPedido(ctx, data as string);
}

/** Edita itens (produtos, quantidades, preços, descontos), pagamento e prazo; confirmado recalcula a comissão (função SQL editar_pedido). */
export async function editarPedido(ctx: Contexto, id: string, input: unknown): Promise<Pedido> {
  const p = edicaoPedidoSchema.parse(input);
  const { error } = await ctx.supabase.rpc("editar_pedido", {
    p_pedido_id: idSchema.parse(id),
    p_itens: p.itens,
    p_forma_pagamento: p.forma_pagamento ?? null,
    p_prazo_tipo: p.prazo_tipo,
    p_prazo_dias: p.prazo_dias,
    p_codigo: p.codigo_pedido ?? null,
  });
  if (error) throw erroPedido(error);
  return obterPedido(ctx, id);
}

export const MSG_CODIGO_DUPLICADO = "Já existe um pedido com este código";

/** Unicidade (user_id, codigo_pedido) vira mensagem clara; demais duplicidades seguem a mensagem padrão. */
function erroPedido(error: PostgrestError, duplicado?: string): AppError {
  if (error.code === "23505" && `${error.message} ${error.details}`.includes("codigo_pedido")) {
    return new AppError(409, MSG_CODIGO_DUPLICADO, "duplicado");
  }
  return erroBanco(error, duplicado);
}

/**
 * Preview do próximo código gerado (mesma regra de numeração da função criar_pedido: P + contagem + 1).
 * Só exibição: o código real é gravado no servidor ao salvar (sem corrida entre pedidos simultâneos).
 */
export async function proximoCodigoPedido({ supabase }: Contexto): Promise<string> {
  const { count, error } = await supabase.from("pedidos").select("id", { count: "exact", head: true });
  if (error) throw erroBanco(error);
  return "P" + String((count ?? 0) + 1).padStart(6, "0");
}

const consultaCodigoSchema = z.object({
  codigo: z.string().trim().min(1, "Informe o código do pedido").max(40, "Código do pedido muito longo (máx. 40)"),
  ignorar: idSchema.nullable().optional(),
});

/** Checagem prévia de duplicidade (o formulário avisa sem perder os dados); a garantia final é a unique do banco. */
export async function codigoPedidoDisponivel({ supabase }: Contexto, input: unknown): Promise<{ disponivel: boolean }> {
  const { codigo, ignorar } = consultaCodigoSchema.parse(input);
  let q = supabase.from("pedidos").select("id").eq("codigo_pedido", codigo).limit(1);
  if (ignorar) q = q.neq("id", ignorar);
  const { data, error } = await q.returns<{ id: string }[]>();
  if (error) throw erroBanco(error);
  return { disponivel: data.length === 0 };
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

/**
 * Exclui o pedido (itens em cascata). Confirmado/entregue/cancelado: a comissão lançada é apagada junto;
 * bloqueado quando a comissão já foi recebida (o histórico de recebimento não some).
 */
export async function excluirPedido({ supabase }: Contexto, id: string): Promise<void> {
  const pedidoId = idSchema.parse(id);
  const { data: com, error: e1 } = await supabase.from("comissoes").select("id, status").eq("pedido_id", pedidoId).returns<{ id: string; status: string }[]>();
  if (e1) throw erroBanco(e1);
  if (com.some((c) => c.status === "recebida")) throw new AppError(400, "Comissão já recebida: este pedido não pode ser excluído", "regra");
  if (com.length) {
    const { error } = await supabase.from("comissoes").delete().eq("pedido_id", pedidoId);
    if (error) throw erroBanco(error);
  }
  const { error, count } = await supabase.from("pedidos").delete({ count: "exact" }).eq("id", pedidoId);
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Pedido não encontrado", "nao_encontrado");
}

/* ---------- Pendências de pedidos importados (Fase 17) ---------- */

/** Liga ao produto os itens pendentes com o mesmo SKU nos pedidos da mesma representada (preço do item não muda). */
export async function vincularPendentesAoProduto({ supabase }: Contexto, produtoId: string): Promise<number> {
  const { data, error } = await supabase.rpc("vincular_produto_pendente", { p_produto_id: idSchema.parse(produtoId) });
  if (error) throw erroBanco(error);
  return Number(data ?? 0);
}

/** "Vincular produto" do alerta do Catálogo: acha o produto (representada + SKU) e vincula os itens pendentes. */
export async function vincularProdutoPendentes(ctx: Contexto, representadaId: string, sku: unknown): Promise<number> {
  const s = z.string().trim().min(1).max(60).parse(sku);
  const { data, error } = await ctx.supabase
    .from("produtos").select("id").eq("representada_id", idSchema.parse(representadaId)).eq("sku", s).maybeSingle<{ id: string }>();
  if (error) throw erroBanco(error);
  if (!data) throw new AppError(404, `O SKU ${s} não está no Catálogo desta representada`, "nao_encontrado");
  return vincularPendentesAoProduto(ctx, data.id);
}

export type PendenciaCatalogo = { sku: string; descricao: string | null; preco: number; itens: number; pedidos: number; produto: { id: string; nome: string } | null };

/**
 * Itens de pedidos desta representada sem produto vinculado (pendência "produto não cadastrado"), agrupados por SKU.
 * produto preenchido = o SKU já existe no Catálogo, só falta vincular (caso 2); null = SKU a cadastrar (caso 1).
 */
export async function pendenciasDoCatalogo({ supabase }: Contexto, representadaId: string): Promise<PendenciaCatalogo[]> {
  const rep = idSchema.parse(representadaId);
  const { data, error } = await supabase
    .from("pedido_itens")
    .select("sku_planilha, descricao, preco_unitario, pedido_id, pedido:pedidos!inner(representada_id)")
    .eq("pendencia", "produto_nao_cadastrado").is("produto_id", null).eq("pedido.representada_id", rep)
    .returns<{ sku_planilha: string | null; descricao: string | null; preco_unitario: number; pedido_id: string }[]>();
  if (error) throw erroBanco(error);
  const porSku = new Map<string, { descricao: string | null; preco: number; itens: number; pedidos: Set<string> }>();
  for (const i of data) {
    if (!i.sku_planilha) continue;
    const g = porSku.get(i.sku_planilha) ?? { descricao: i.descricao, preco: Number(i.preco_unitario), itens: 0, pedidos: new Set<string>() };
    g.itens += 1;
    g.pedidos.add(i.pedido_id);
    porSku.set(i.sku_planilha, g);
  }
  if (!porSku.size) return [];
  const { data: prods, error: e2 } = await supabase
    .from("produtos").select("id, sku, nome").eq("representada_id", rep).in("sku", [...porSku.keys()])
    .returns<{ id: string; sku: string; nome: string }[]>();
  if (e2) throw erroBanco(e2);
  const existentes = new Map(prods.map((p) => [p.sku, { id: p.id, nome: p.nome }]));
  return [...porSku].map(([sku, g]) => ({ sku, descricao: g.descricao, preco: g.preco, itens: g.itens, pedidos: g.pedidos.size, produto: existentes.get(sku) ?? null }))
    .sort((a, b) => a.sku.localeCompare(b.sku));
}
