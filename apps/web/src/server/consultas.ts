import { idSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { erroBanco } from "./erros";

/** Consultas somente leitura usadas nas páginas de cliente e representada (Fase 3). */

export type PedidoResumo = {
  id: string;
  numero: string;
  data: string;
  status: string;
  valor_total: number;
  comissao_total: number;
  cliente: { id: string; nome: string } | null;
  representada: { id: string; nome: string } | null;
};

const CAMPOS_PEDIDO =
  "id, numero, data, status, valor_total, comissao_total, cliente:clientes(id, nome), representada:representadas(id, nome)";

export async function listarPedidos(
  { supabase }: Contexto,
  filtro?: { cliente_id: string } | { representada_id: string },
): Promise<PedidoResumo[]> {
  let q = supabase.from("pedidos").select(CAMPOS_PEDIDO);
  if (filtro && "cliente_id" in filtro) q = q.eq("cliente_id", idSchema.parse(filtro.cliente_id));
  else if (filtro) q = q.eq("representada_id", idSchema.parse(filtro.representada_id));
  const { data, error } = await q
    .order("data", { ascending: false })
    .limit(100)
    .returns<PedidoResumo[]>();
  if (error) throw erroBanco(error);
  return data;
}

export type PrecoTabela = {
  id: string;
  preco: number;
  desconto_max: number | null;
  produto: { id: string; sku: string; nome: string } | null;
  cliente: { id: string; nome: string } | null;
};

/** Tabela de preços da representada: padrão (cliente null) e preços específicos por cliente. */
export async function listarTabelaPrecos({ supabase }: Contexto, representadaId: string): Promise<PrecoTabela[]> {
  const { data, error } = await supabase
    .from("tabelas_preco")
    .select("id, preco, desconto_max, produto:produtos(id, sku, nome), cliente:clientes(id, nome)")
    .eq("representada_id", idSchema.parse(representadaId))
    .returns<PrecoTabela[]>();
  if (error) throw erroBanco(error);
  return data.sort(
    (a, b) =>
      (a.cliente?.nome ?? "").localeCompare(b.cliente?.nome ?? "") ||
      (a.produto?.nome ?? "").localeCompare(b.produto?.nome ?? ""),
  );
}

export type ResumoRepresentada = { clientes: number; produtos: number; pedidos: number };

export async function resumoRepresentada({ supabase }: Contexto, representadaId: string): Promise<ResumoRepresentada> {
  const id = idSchema.parse(representadaId);
  const contar = (tabela: string) =>
    supabase.from(tabela).select("id", { count: "exact", head: true }).eq("representada_id", id);
  const [clientes, produtos, pedidos] = await Promise.all([
    contar("cliente_representada"),
    contar("produtos"),
    contar("pedidos"),
  ]);
  for (const r of [clientes, produtos, pedidos]) if (r.error) throw erroBanco(r.error);
  return { clientes: clientes.count ?? 0, produtos: produtos.count ?? 0, pedidos: pedidos.count ?? 0 };
}

/** Clientes vinculados a uma representada (para envio de catálogo). */
export async function listarClientesDaRepresentada({ supabase }: Contexto, representadaId: string): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase
    .from("cliente_representada")
    .select("cliente:clientes(id, nome)")
    .eq("representada_id", idSchema.parse(representadaId))
    .returns<{ cliente: { id: string; nome: string } | null }[]>();
  if (error) throw erroBanco(error);
  return data.flatMap((v) => (v.cliente ? [v.cliente] : [])).sort((a, b) => a.nome.localeCompare(b.nome));
}

export type Tarefa = { id: string; titulo: string; data: string | null; tipo: string | null; cliente: { id: string; nome: string } | null };

/** Tarefas pendentes (ex.: follow-up pós-visita gerado pelo job diário). */
export async function listarTarefasPendentes({ supabase }: Contexto): Promise<Tarefa[]> {
  const { data, error } = await supabase
    .from("tarefas")
    .select("id, titulo, data, tipo, cliente:clientes(id, nome)")
    .eq("concluida", false)
    .order("data", { ascending: true })
    .limit(50)
    .returns<Tarefa[]>();
  if (error) throw erroBanco(error);
  return data;
}
