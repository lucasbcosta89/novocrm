import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/sidebar";
import { COOKIE_SIDEBAR } from "@/lib/navegacao";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Cadastro pós-checkout pendente: assinatura ativa sem aceite LGPD registrado
  const [{ data: usuario }, { data: assinatura }, jar] = await Promise.all([
    supabase.from("usuarios").select("nome, consentimento_lgpd_aceito_em").eq("id", user.id).maybeSingle<{ nome: string; consentimento_lgpd_aceito_em: string | null }>(),
    supabase.from("assinaturas").select("status").eq("user_id", user.id).maybeSingle<{ status: string }>(),
    cookies(),
  ]);
  const cadastroPendente = assinatura?.status === "active" && !usuario?.consentimento_lgpd_aceito_em;

  return (
    <Shell nome={usuario?.nome ?? null} colapsadaInicial={jar.get(COOKIE_SIDEBAR)?.value === "colapsada"}>
      {cadastroPendente && (
        <p className="aviso aviso-erro alerta">
          Assinatura confirmada! Falta concluir seu cadastro. <Link href="/app/cadastro">Concluir cadastro</Link>
        </p>
      )}
      {children}
    </Shell>
  );
}
