import "server-only";
import { emAberto, type ModeloFunil } from "@/lib/funis";
import { etapaSchema, funilSchema, idSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

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

/* ---------- Personalizar funil (etapas) ---------- */

async function etapasDoFunil({ supabase }: Contexto, funilId: string): Promise<Etapa[]> {
  const { data, error } = await supabase
    .from("funil_etapas")
    .select("id, nome, ordem, e_fechamento")
    .eq("funil_id", idSchema.parse(funilId))
    .order("ordem")
    .returns<Etapa[]>();
  if (error) throw erroBanco(error);
  if (data.length === 0) throw new AppError(404, "Funil não encontrado", "nao_encontrado");
  return data;
}

async function etapaComFunil({ supabase }: Contexto, etapaId: string) {
  const { data, error } = await supabase
    .from("funil_etapas")
    .select("id, funil_id, e_fechamento")
    .eq("id", idSchema.parse(etapaId))
    .maybeSingle<{ id: string; funil_id: string; e_fechamento: boolean }>();
  if (error) throw erroBanco(error);
  if (!data) throw new AppError(404, "Etapa não encontrada", "nao_encontrado");
  return data;
}

/** Nova etapa entra antes da etapa de fechamento (que segue sendo a última). */
export async function adicionarEtapa(ctx: Contexto, funilId: string, input: unknown): Promise<void> {
  const { nome } = etapaSchema.parse(input);
  const etapas = await etapasDoFunil(ctx, funilId);
  const fechamento = etapas.find((e) => e.e_fechamento);
  const ultima = etapas[etapas.length - 1]!.ordem;
  let ordem = ultima + 1;
  if (fechamento) {
    ordem = fechamento.ordem;
    const { error } = await ctx.supabase.from("funil_etapas").update({ ordem: ultima + 1 }).eq("id", fechamento.id);
    if (error) throw erroBanco(error);
  }
  const { error } = await ctx.supabase.from("funil_etapas").insert({ funil_id: funilId, nome, ordem });
  if (error) throw erroBanco(error);
}

export async function renomearEtapa(ctx: Contexto, etapaId: string, input: unknown): Promise<void> {
  const { nome } = etapaSchema.parse(input);
  const etapa = await etapaComFunil(ctx, etapaId);
  if (etapa.e_fechamento) throw new AppError(400, "A etapa de fechamento não pode ser renomeada", "regra");
  const { error } = await ctx.supabase.from("funil_etapas").update({ nome }).eq("id", etapa.id);
  if (error) throw erroBanco(error);
}

/** Exclui etapa; as oportunidades dela vão para a primeira etapa restante do funil. */
export async function excluirEtapa(ctx: Contexto, etapaId: string): Promise<void> {
  const etapa = await etapaComFunil(ctx, etapaId);
  if (etapa.e_fechamento) throw new AppError(400, "A etapa de fechamento não pode ser excluída", "regra");
  const restantes = (await etapasDoFunil(ctx, etapa.funil_id)).filter((e) => e.id !== etapa.id);
  const destino = restantes.find((e) => !e.e_fechamento);
  if (!destino) throw new AppError(400, "O funil precisa de ao menos uma etapa além do fechamento", "regra");
  const mover = await ctx.supabase.from("oportunidades_desafios").update({ etapa_id: destino.id }).eq("etapa_id", etapa.id);
  if (mover.error) throw erroBanco(mover.error);
  const { error } = await ctx.supabase.from("funil_etapas").delete().eq("id", etapa.id);
  if (error) throw erroBanco(error);
}
