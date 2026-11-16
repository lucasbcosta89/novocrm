"use server";

import { obterContexto } from "@/server/contexto";
import { salvarOnboarding } from "@/server/onboarding";

/** Fase 23.2 — grava só o progresso do passo a passo (etapa, pulado ou concluído). Falha silenciosa: nunca bloqueia o uso. */
export async function salvarOnboardingAction(entrada: { acao: "etapa"; etapa: number } | { acao: "pular" } | { acao: "concluir" }): Promise<void> {
  try {
    await salvarOnboarding(await obterContexto(), entrada);
  } catch (e) {
    console.error("onboarding", e);
  }
}
