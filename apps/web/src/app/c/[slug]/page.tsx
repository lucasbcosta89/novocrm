import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { linkWhatsApp } from "@/lib/whatsapp";
import { carregarCatalogoPublico, type ProdutoPublico } from "@/server/catalogo-publico";
import { Carrinho } from "./carrinho";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await carregarCatalogoPublico((await params).slug);
  return { title: c ? `Catálogo ${c.marca.nome}` : "Catálogo", robots: { index: false } };
}

export default async function CatalogoPublicoPage({ params }: Props) {
  const { slug } = await params;
  const c = await carregarCatalogoPublico(slug);
  if (!c) notFound();

  const grupos = new Map<string, ProdutoPublico[]>();
  for (const p of c.produtos) {
    const g = p.categoria?.trim() || "Outros";
    grupos.set(g, [...(grupos.get(g) ?? []), p]);
  }
  const contato = c.representante.whatsapp
    ? linkWhatsApp(c.representante.whatsapp, `Olá ${c.representante.nome}! Vi o catálogo da ${c.marca.nome} e gostaria de falar sobre um pedido.`)
    : null;

  return (
    <div className="publico">
      <header className="publico-topo">
        <div>
          <p className="dica">Catálogo digital</p>
          <h1>{c.marca.nome}</h1>
          {c.representante.nome && <p className="dica">Representante: {c.representante.nome}</p>}
        </div>
        {contato && <a className="btn" href={contato} target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>}
      </header>

      {c.marcas.length > 1 && (
        <nav className="abas" aria-label="Marcas">
          {c.marcas.map((m) => (
            <Link key={m.id} href={`/c/${m.slug}`} className={m.slug === slug ? "aba ativa" : "aba"} aria-current={m.slug === slug ? "page" : undefined}>
              {m.nome}
            </Link>
          ))}
        </nav>
      )}

      {c.produtos.length === 0 ? (
        <div className="vazio">Nenhum produto disponível no momento.</div>
      ) : (
        <Carrinho
          slug={slug}
          aceitaPedidos={c.marca.aceitaPedidos}
          grupos={[...grupos.entries()].map(([categoria, produtos]) => ({ categoria, produtos }))}
          contatoWhatsApp={contato}
        />
      )}
    </div>
  );
}
