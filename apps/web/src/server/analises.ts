import "server-only";
import { analiseSpecSchema } from "@/lib/analises/catalogo";
import type { ResultadoAgregado } from "@/lib/analises/tipos";
import type { Contexto } from "./contexto";
import { erroBanco } from "./erros";

/**
 * Engine de pivot: valida a spec (catálogo fechado) e executa UMA consulta agregada no banco
 * (função analise_pivot, security invoker → RLS do usuário). Linhas, totais recalculados e
 * período anterior vêm da mesma chamada.
 */
export async function executarAnalise({ supabase }: Contexto, entrada: unknown): Promise<ResultadoAgregado> {
  const spec = analiseSpecSchema.parse(entrada);
  const { data, error } = await supabase.rpc("analise_pivot", { p_spec: spec });
  if (error) throw erroBanco(error);
  return data as ResultadoAgregado;
}

export type OpcoesFiltro = { representadas: { id: string; nome: string }[]; clientes: { id: string; nome: string }[]; produtos: { id: string; nome: string }[]; ufs: string[] };

/** Opções dos filtros globais (só o que o usuário enxerga via RLS). */
export async function opcoesFiltros({ supabase }: Contexto): Promise<OpcoesFiltro> {
  const [reps, clis, prods] = await Promise.all([
    supabase.from("representadas").select("id, nome").order("nome"),
    supabase.from("clientes").select("id, nome, uf").order("nome"),
    supabase.from("produtos").select("id, nome, sku").order("nome").limit(5000),
  ]);
  const erro = reps.error ?? clis.error ?? prods.error;
  if (erro) throw erroBanco(erro);
  return {
    representadas: reps.data ?? [],
    clientes: (clis.data ?? []).map((c) => ({ id: c.id, nome: c.nome })),
    produtos: (prods.data ?? []).map((p) => ({ id: p.id, nome: `${p.nome} (${p.sku})` })),
    ufs: [...new Set((clis.data ?? []).map((c) => c.uf).filter((u): u is string => !!u))].sort(),
  };
}
