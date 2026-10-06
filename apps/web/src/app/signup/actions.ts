"use server";

import { redirect } from "next/navigation";
import { primeiroErro, signupSchema } from "@/lib/auth-schema";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export async function criarConta(formData: FormData) {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/signup?erro=${encodeURIComponent(primeiroErro(parsed.error))}`);
  const { nome, email, senha } = parsed.data;

  // Fase 1: conta criada ja confirmada (sem e-mail de verificacao); trigger cria a linha em usuarios.
  const { error: createError } = await supabaseAdmin().auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (createError) {
    const msg = createError.code === "email_exists" ? "E-mail já cadastrado" : "Não foi possível criar a conta";
    redirect(`/signup?erro=${encodeURIComponent(msg)}`);
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) redirect("/login");

  redirect("/app");
}
