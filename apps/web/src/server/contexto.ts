import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";
import { AppError } from "./erros";

/** Cliente com a sessão do usuário: o RLS isola os dados por dono. */
export type Contexto = { supabase: SupabaseClient; userId: string };

/** Sessão via cookie (web) ou Authorization: Bearer <access_token> (app mobile). */
export async function obterContexto(): Promise<Contexto> {
  const auth = (await headers()).get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (token) {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = env();
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await supabase.auth.getUser(token);
    if (!data.user) throw new AppError(401, "Sessão expirada", "nao_autenticado");
    return { supabase, userId: data.user.id };
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AppError(401, "Não autenticado", "nao_autenticado");
  return { supabase, userId: user.id };
}
