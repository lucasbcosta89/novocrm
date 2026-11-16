"use server";

import { obterContexto } from "@/server/contexto";
import { diagnosticoGuia, type ResultadoDiagnostico } from "@/server/guia";

/** Fase 23.1 (C.4) — única Server Action do diagnóstico: somente leitura, RLS do usuário. */
export async function obterDiagnosticoGuia(): Promise<ResultadoDiagnostico> {
  return diagnosticoGuia(await obterContexto());
}
