import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

/** Recursos contados pelo total de linhas do usuário (os mensais entram na Fase 6). */
export type RecursoContavel = "representadas" | "clientes";

const NOMES: Record<RecursoContavel, string> = { representadas: "representadas", clientes: "clientes" };

/** null/undefined = ilimitado. */
export function limiteAtingido(limite: number | null | undefined, usados: number): boolean {
  return limite != null && usados >= limite;
}

/** Quota service: toda criação de recurso limitado por plano passa por aqui (lado servidor). */
export async function verificarLimite({ supabase, userId }: Contexto, recurso: RecursoContavel): Promise<void> {
  const { data: usuario, error } = await supabase
    .from("usuarios")
    .select("plano, planos(limites)")
    .eq("id", userId)
    .single<{ plano: string; planos: { limites: Record<string, number | null> } | null }>();
  if (error) throw erroBanco(error);

  const limite = usuario.planos?.limites[recurso];
  if (limite == null) return;

  const { count, error: countError } = await supabase
    .from(recurso)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) throw erroBanco(countError);

  if (limiteAtingido(limite, count ?? 0)) {
    throw new AppError(
      403,
      `Limite do plano ${usuario.plano} atingido: ${limite} ${NOMES[recurso]}. Faça upgrade para cadastrar mais.`,
      "limite_plano",
    );
  }
}
