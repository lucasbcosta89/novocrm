import "server-only";
import { analiseSpecSchema, visaoSchema } from "@/lib/analises/catalogo";
import { ehPreset } from "@/lib/analises/presets";
import type { AnaliseSpec, ResultadoAgregado, VisaoSalva } from "@/lib/analises/tipos";
import { idSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

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

/* ---------- Visões salvas (RLS: só as do próprio usuário) ---------- */

/** Visões da aba + as compartilhadas (visíveis em todas as abas). */
export async function listarVisoes({ supabase }: Contexto, aba: string): Promise<VisaoSalva[]> {
  if (!ehPreset(aba)) throw new AppError(400, "Aba inválida", "aba_invalida");
  const { data, error } = await supabase.from("analise_visoes").select("id, nome, spec, escopo, aba, criado_em")
    .or(`aba.eq.${aba},escopo.eq.compartilhada`).order("criado_em", { ascending: false }).limit(100);
  if (error) throw erroBanco(error);
  return (data ?? []).map((v) => ({ id: v.id, nome: v.nome, spec: v.spec as AnaliseSpec, escopo: v.escopo as VisaoSalva["escopo"], criadoEm: v.criado_em }));
}

export async function salvarVisao({ supabase }: Contexto, entrada: unknown): Promise<VisaoSalva> {
  const v = visaoSchema.parse(entrada);
  const { data, error } = await supabase.from("analise_visoes").insert({ aba: v.aba, nome: v.nome, escopo: v.escopo, spec: v.spec })
    .select("id, nome, spec, escopo, criado_em").single();
  if (error) throw erroBanco(error);
  return { id: data.id, nome: data.nome, spec: data.spec as AnaliseSpec, escopo: data.escopo as VisaoSalva["escopo"], criadoEm: data.criado_em };
}

export async function excluirVisao({ supabase }: Contexto, id: string): Promise<void> {
  const { error, count } = await supabase.from("analise_visoes").delete({ count: "exact" }).eq("id", idSchema.parse(id));
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Visão não encontrada", "nao_encontrado");
}
