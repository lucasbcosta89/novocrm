import { devolucaoSchema, idSchema, STATUS_DEVOLUCAO } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

export type DevolucaoItem = {
  id: string;
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  desconto_percentual: number;
  subtotal: number;
  produto: { sku: string; nome: string } | null;
};

export type Devolucao = {
  id: string;
  numero: string;
  data: string;
  motivo: string;
  status: string;
  valor_total: number;
  forma_pagamento: string | null;
  prazo_tipo: string;
  prazo_dias: number | null;
  observacoes: string | null;
  cliente_id: string;
  representada: { id: string; nome: string } | null;
  pedido: { id: string; codigo_pedido: string } | null;
  itens: DevolucaoItem[];
};

const CAMPOS = `id, numero, data, motivo, status, valor_total, forma_pagamento, prazo_tipo, prazo_dias, observacoes, cliente_id,
  representada:representadas(id, nome:razao_social), pedido:pedidos(id, codigo_pedido),
  itens:devolucao_itens(id, produto_id, quantidade, preco_unitario, desconto_percentual, subtotal, produto:produtos(sku, nome))`;

export type FiltroDevolucoes = { de?: string | null; ate?: string | null; status?: string | null };

/** Devoluções do cliente, mais recentes primeiro; período (data) e status opcionais. */
export async function listarDevolucoes({ supabase }: Contexto, clienteId: string, f: FiltroDevolucoes = {}): Promise<Devolucao[]> {
  let q = supabase.from("devolucoes").select(CAMPOS).eq("cliente_id", idSchema.parse(clienteId));
  if (f.de) q = q.gte("data", f.de);
  if (f.ate) q = q.lte("data", f.ate);
  if (f.status && (STATUS_DEVOLUCAO as readonly string[]).includes(f.status)) q = q.eq("status", f.status);
  const { data, error } = await q.order("data", { ascending: false }).order("numero", { ascending: false }).returns<Devolucao[]>();
  if (error) throw erroBanco(error);
  return data;
}

export async function obterDevolucao({ supabase }: Contexto, id: string): Promise<Devolucao> {
  const { data, error } = await supabase.from("devolucoes").select(CAMPOS).eq("id", idSchema.parse(id)).single<Devolucao>();
  if (error) throw erroBanco(error);
  return data;
}

/**
 * Cria (id null) ou edita a devolução de forma atômica (função SQL salvar_devolucao): subtotais e total vêm do banco,
 * que também bloqueia quantidade acima do pedido de origem.
 */
export async function salvarDevolucao({ supabase }: Contexto, id: string | null, input: unknown): Promise<string> {
  const d = devolucaoSchema.parse(input);
  const { data, error } = await supabase.rpc("salvar_devolucao", {
    p_id: id ? idSchema.parse(id) : null,
    p_cliente_id: d.cliente_id,
    p_representada_id: d.representada_id,
    p_pedido_id: d.pedido_id ?? null,
    p_data: d.data,
    p_motivo: d.motivo,
    p_status: d.status,
    p_forma_pagamento: d.forma_pagamento ?? null,
    p_prazo_tipo: d.prazo_tipo,
    p_prazo_dias: d.prazo_dias ?? null,
    p_observacoes: d.observacoes ?? null,
    p_itens: d.itens,
  });
  if (error) throw erroBanco(error, "Número de devolução em uso; tente novamente");
  return data as string;
}

export async function excluirDevolucao({ supabase }: Contexto, id: string): Promise<void> {
  const { error, count } = await supabase.from("devolucoes").delete({ count: "exact" }).eq("id", idSchema.parse(id));
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Devolução não encontrada", "nao_encontrado");
}

/** Itens já devolvidos por produto em um pedido (outras devoluções não recusadas), para limitar a quantidade no formulário. */
export async function devolvidoNoPedido({ supabase }: Contexto, pedidoId: string, exceto?: string): Promise<Map<string, number>> {
  let q = supabase.from("devolucao_itens").select("produto_id, quantidade, devolucao:devolucoes!inner(id, pedido_id, status)")
    .eq("devolucao.pedido_id", idSchema.parse(pedidoId)).neq("devolucao.status", "recusada");
  if (exceto) q = q.neq("devolucao.id", idSchema.parse(exceto));
  const { data, error } = await q.returns<{ produto_id: string; quantidade: number }[]>();
  if (error) throw erroBanco(error);
  const mapa = new Map<string, number>();
  for (const i of data) mapa.set(i.produto_id, (mapa.get(i.produto_id) ?? 0) + Number(i.quantidade));
  return mapa;
}
