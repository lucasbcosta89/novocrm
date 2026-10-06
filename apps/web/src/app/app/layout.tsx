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

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/app" className="marca">CRM Multimarcas</Link>
        <nav>
          {SECOES.map((s) => (
            <Link key={s.slug} href={`/app/${s.slug}`}>{s.titulo}</Link>
          ))}
        </nav>
        <form action="/auth/signout" method="post">
          <button className="btn-link" type="submit">Sair ({user.email})</button>
        </form>
      </aside>
      <main className="conteudo">{children}</main>
    </div>
  );
}
