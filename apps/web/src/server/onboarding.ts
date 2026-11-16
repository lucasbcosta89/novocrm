import { z } from "zod";
import type { Contexto } from "./contexto";
import { erroBanco } from "./erros";

/** Fase 23.2 — estado do passo a passo (somente colunas de onboarding em usuarios; nenhum dado de negócio). */
export type EstadoOnboarding = { concluido: boolean; pulado: boolean; etapa: number };

export async function obterOnboarding({ supabase, userId }: Contexto): Promise<EstadoOnboarding> {
  const { data, error } = await supabase.from("usuarios").select("onboarding_concluido, onboarding_pulado, onboarding_etapa").eq("id", userId)
    .maybeSingle<{ onboarding_concluido: boolean; onboarding_pulado: boolean; onboarding_etapa: number }>();
  if (error) throw erroBanco(error);
  return { concluido: !!data?.onboarding_concluido, pulado: !!data?.onboarding_pulado, etapa: data?.onboarding_etapa ?? 0 };
}

const entradaSchema = z.union([
  z.object({ acao: z.literal("etapa"), etapa: z.number().int().min(0).max(6) }),
  z.object({ acao: z.literal("pular") }),
  z.object({ acao: z.literal("concluir") }),
]);

export async function salvarOnboarding({ supabase, userId }: Contexto, entrada: unknown): Promise<void> {
  const e = entradaSchema.parse(entrada);
  const dados = e.acao === "etapa" ? { onboarding_etapa: e.etapa }
    : e.acao === "pular" ? { onboarding_pulado: true, onboarding_visto_em: new Date().toISOString() }
    : { onboarding_concluido: true, onboarding_etapa: 6, onboarding_visto_em: new Date().toISOString() };
  const { error } = await supabase.from("usuarios").update(dados).eq("id", userId);
  if (error) throw erroBanco(error);
}
