"use server";

import { redirect } from "next/navigation";
import { loginSchema, primeiroErro } from "@/lib/auth-schema";
import { supabaseServer } from "@/lib/supabase/server";

export async function entrar(formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/login?erro=${encodeURIComponent(primeiroErro(parsed.error))}`);

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  });
  if (error) redirect(`/login?erro=${encodeURIComponent("E-mail ou senha incorretos")}`);

  redirect("/app");
}
