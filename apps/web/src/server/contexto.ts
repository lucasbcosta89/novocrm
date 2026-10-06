import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { AppError } from "./erros";

/** Cliente com a sessão do usuário: o RLS isola os dados por dono. */
export type Contexto = { supabase: SupabaseClient; userId: string };

export async function obterContexto(): Promise<Contexto> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AppError(401, "Não autenticado", "nao_autenticado");
  return { supabase, userId: user.id };
}
