import Link from "next/link";
import { redirect } from "next/navigation";
import { SECOES } from "@/lib/navegacao";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Cadastro pós-checkout pendente: assinatura ativa sem aceite LGPD registrado
  const [{ data: usuario }, { data: assinatura }] = await Promise.all([
    supabase.from("usuarios").select("nome, consentimento_lgpd_aceito_em").eq("id", user.id).maybeSingle<{ nome: string; consentimento_lgpd_aceito_em: string | null }>(),
    supabase.from("assinaturas").select("status").eq("user_id", user.id).maybeSingle<{ status: string }>(),
  ]);
  const cadastroPendente = assinatura?.status === "active" && !usuario?.consentimento_lgpd_aceito_em;

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/app" className="marca">CRM Multimarcas</Link>
        <nav>
          {SECOES.map((s) => (
            <Link key={s.slug} href={`/app/${s.slug}`}>{s.titulo}</Link>
          ))}
        </nav>
        <div className="sidebar-conta">
          <Link href="/app/perfil" className="link-conta">Meus dados{usuario?.nome ? ` · ${usuario.nome}` : ""}</Link>
          <form action="/auth/signout" method="post">
            <button className="btn-link" type="submit">Sair ({user.email})</button>
          </form>
        </div>
      </aside>
      <main className="conteudo">
        {cadastroPendente && (
          <p className="aviso aviso-erro alerta">
            Assinatura confirmada! Falta concluir seu cadastro. <Link href="/app/cadastro">Concluir cadastro</Link>
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
