"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verificarHumano } from "@/lib/anti-bot";
import { loginSchema, primeiroErro } from "@/lib/auth-schema";
import { supabaseServer } from "@/lib/supabase/server";

export async function entrar(formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/login?erro=${encodeURIComponent(primeiroErro(parsed.error))}`);

  const h = await headers();
  const bloqueio = await verificarHumano(formData, h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null);
  if (bloqueio) redirect(`/login?erro=${encodeURIComponent(bloqueio)}`);

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  });
  if (error) redirect(`/login?erro=${encodeURIComponent("E-mail ou senha incorretos")}`);

  redirect("/app");
}
