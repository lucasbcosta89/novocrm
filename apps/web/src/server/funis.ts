import "server-only";
import { emAberto, type ModeloFunil } from "@/lib/funis";
import { funilSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { erroBanco } from "./erros";

export type Etapa = { id: string; nome: string; ordem: number; e_fechamento: boolean };
export type Funil = { id: string; nome: string; modelo: ModeloFunil; criado_em: string; etapas: Etapa[]; emAberto: number };

/** Funis do usuário (com etapas em ordem) + contagem de oportunidades em aberto por funil. */
export async function listarFunis({ supabase }: Contexto): Promise<Funil[]> {
  const [funis, ops] = await Promise.all([
    supabase
      .from("funis")
      .select("id, nome, modelo, criado_em, etapas:funil_etapas(id, nome, ordem, e_fechamento)")
      .order("criado_em")
      .returns<Omit<Funil, "emAberto">[]>(),
    supabase.from("oportunidades_desafios").select("funil_id, status, arquivada").returns<{ funil_id: string | null; status: string; arquivada: boolean }[]>(),
  ]);
  if (funis.error) throw erroBanco(funis.error);
  if (ops.error) throw erroBanco(ops.error);
  const abertas = new Map<string, number>();
  for (const o of ops.data) if (o.funil_id && emAberto(o)) abertas.set(o.funil_id, (abertas.get(o.funil_id) ?? 0) + 1);
  return funis.data.map((f) => ({ ...f, etapas: [...f.etapas].sort((a, b) => a.ordem - b.ordem), emAberto: abertas.get(f.id) ?? 0 }));
}

/** Cria funil + etapas do modelo (função SQL criar_funil). */
export async function criarFunil({ supabase }: Contexto, input: unknown): Promise<string> {
  const f = funilSchema.parse(input);
  const { data, error } = await supabase.rpc("criar_funil", { p_nome: f.nome, p_modelo: f.modelo });
  if (error) throw erroBanco(error);
  return data as string;
}

/** Base do log: funil e resultado de todas as oportunidades (inclusive arquivadas). */
export async function listarResultados({ supabase }: Contexto): Promise<{ funil_id: string | null; resultado: string | null }[]> {
  const { data, error } = await supabase
    .from("oportunidades_desafios")
    .select("funil_id, resultado")
    .returns<{ funil_id: string | null; resultado: string | null }[]>();
  if (error) throw erroBanco(error);
  return data;
}
