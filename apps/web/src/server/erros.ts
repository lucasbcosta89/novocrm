import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { primeiroErroZod } from "@/lib/validacao";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Converte erro do PostgREST em AppError com mensagem amigável. */
export function erroBanco(error: PostgrestError, duplicado = "Registro já existe"): AppError {
  if (error.code === "23505") return new AppError(409, duplicado, "duplicado");
  if (error.code === "42501") return new AppError(403, "Acesso negado", "rls");
  if (error.code === "23503") return new AppError(409, "Registro está em uso por outros dados", "fk");
  if (error.hint === "LIMITE_ATINGIDO") return new AppError(403, error.message, "LIMITE_ATINGIDO");
  // raise exception nas funções SQL (regra de negócio): mensagem já é amigável
  if (error.code === "P0001") return new AppError(400, error.message, "regra");
  if (error.code === "PGRST116") return new AppError(404, "Não encontrado", "nao_encontrado");
  console.error("PostgREST", error.code, error.message, error.details);
  return new AppError(500, `Erro ao acessar o banco (código ${error.code || "?"})`, error.code);
}

export function normalizarErro(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof z.ZodError) return new AppError(400, primeiroErroZod(e), "validacao");
  console.error(e);
  return new AppError(500, "Erro interno");
}
