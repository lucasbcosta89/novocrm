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
  filtro: { cliente_id: string } | { representada_id: string },
): Promise<PedidoResumo[]> {
  const [coluna, valor] = "cliente_id" in filtro ? ["cliente_id", filtro.cliente_id] : ["representada_id", filtro.representada_id];
  const { data, error } = await supabase
    .from("pedidos")
    .select(CAMPOS_PEDIDO)
    .eq(coluna, idSchema.parse(valor))
    .order("data", { ascending: false })
    .limit(100)
    .returns<PedidoResumo[]>();
  if (error) throw erroBanco(error);
  return data;
}

export type OportunidadeResumo = {
  id: string;
  tipo: "oportunidade" | "desafio";
  titulo: string;
  status: string;
  prioridade: string;
  valor_estimado: number | null;
  representada: { nome: string } | null;
};

export async function listarOportunidades({ supabase }: Contexto, clienteId: string): Promise<OportunidadeResumo[]> {
  const { data, error } = await supabase
    .from("oportunidades_desafios")
    .select("id, tipo, titulo, status, prioridade, valor_estimado, representada:representadas(nome)")
    .eq("cliente_id", idSchema.parse(clienteId))
    .order("criado_em", { ascending: false })
    .returns<OportunidadeResumo[]>();
  if (error) throw erroBanco(error);
  return data;
}

export type PrecoTabela = {
  id: string;
  preco: number;
  desconto_max: number | null;
  produto: { sku: string; nome: string } | null;
  cliente: { id: string; nome: string } | null;
};

/** Tabela de preços da representada: padrão (cliente null) e preços específicos por cliente. */
export async function listarTabelaPrecos({ supabase }: Contexto, representadaId: string): Promise<PrecoTabela[]> {
  const { data, error } = await supabase
    .from("tabelas_preco")
    .select("id, preco, desconto_max, produto:produtos(sku, nome), cliente:clientes(id, nome)")
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
