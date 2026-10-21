"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { COOKIE_SIDEBAR, SECOES } from "@/lib/navegacao";
import { Icone, type NomeIcone } from "./icones";
import { LogoSimbolo } from "./logo";

type Item = { href: string; rotulo: string; icone: NomeIcone };

const PRINCIPAIS: Item[] = [
  { href: "/app", rotulo: "Dashboard", icone: "painel" },
  ...SECOES.filter((s) => s.slug !== "configurar").map((s) => ({ href: `/app/${s.slug}`, rotulo: s.titulo, icone: s.icone })),
];
const CONFIGURAR: Item = { href: "/app/configurar", rotulo: "Configurações", icone: "engrenagem" };
const MEUS_DADOS: Item = { href: "/app/perfil", rotulo: "Meus dados", icone: "usuario" };

/**
 * Casca da área logada: sidebar azul (expande 248px / recolhe 72px), barra superior no celular
 * com gaveta + overlay, e o conteúdo da página.
 */
export function Shell({ nome, colapsadaInicial, children }: { nome: string | null; colapsadaInicial: boolean; children: React.ReactNode }) {
  const caminho = usePathname();
  const [colapsada, setColapsada] = useState(colapsadaInicial);
  const [gavetaAberta, setGavetaAberta] = useState(false);

  // gaveta (celular): fecha com Esc; os links fecham no clique
  useEffect(() => {
    if (!gavetaAberta) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setGavetaAberta(false);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [gavetaAberta]);

  function alternar() {
    const nova = !colapsada;
    setColapsada(nova);
    document.cookie = `${COOKIE_SIDEBAR}=${nova ? "colapsada" : "expandida"}; path=/; max-age=31536000; samesite=lax`;
  }

  const ativo = (href: string) => (href === "/app" ? caminho === "/app" : caminho === href || caminho.startsWith(`${href}/`));
  const primeiroNome = nome?.trim().split(/\s+/)[0];

  const link = (i: Item) => (
    <Link
      key={i.href}
      href={i.href}
      className={ativo(i.href) ? "nav-item ativo" : "nav-item"}
      aria-current={ativo(i.href) ? "page" : undefined}
      aria-label={i.rotulo}
      data-dica={i.rotulo}
      onClick={() => setGavetaAberta(false)}
    >
      <Icone nome={i.icone} />
      <span className="rotulo">{i.rotulo}</span>
    </Link>
  );

  return (
    <div className={`shell${colapsada ? " colapsada" : ""}${gavetaAberta ? " gaveta-aberta" : ""}`}>
      <header className="barra-topo">
        <button type="button" className="botao-icone" aria-label="Abrir menu" aria-expanded={gavetaAberta} aria-controls="sidebar" onClick={() => setGavetaAberta(true)}>
          <Icone nome="menu" tamanho={22} />
        </button>
        <Link href="/app" className="barra-topo-marca"><LogoSimbolo tamanho={28} /> CRM Multimarcas</Link>
      </header>

      <div className="overlay" aria-hidden="true" onClick={() => setGavetaAberta(false)} />

      <aside className="sidebar" id="sidebar" aria-label="Menu principal">
        <div className="sidebar-topo">
          <Link href="/app" className="marca" aria-label="CRM Multimarcas — Dashboard">
            <LogoSimbolo />
            <span className="rotulo">CRM Multimarcas</span>
          </Link>
          <button
            type="button"
            className="botao-icone botao-recolher"
            aria-label={colapsada ? "Expandir menu" : "Recolher menu"}
            aria-expanded={!colapsada}
            aria-controls="sidebar"
            data-dica={colapsada ? "Expandir menu" : "Recolher menu"}
            onClick={alternar}
          >
            <Icone nome={colapsada ? "expandir" : "recolher"} />
          </button>
          <button type="button" className="botao-icone botao-fechar" aria-label="Fechar menu" onClick={() => setGavetaAberta(false)}>
            <Icone nome="fechar" />
          </button>
        </div>
        <p className="saudacao rotulo">Oi, {primeiroNome || "tudo bem"}!</p>

        <nav className="sidebar-nav" aria-label="Navegação">{PRINCIPAIS.map(link)}</nav>

        <div className="sidebar-rodape">
          {link(CONFIGURAR)}
          {link(MEUS_DADOS)}
          <form action="/auth/signout" method="post">
            <button type="submit" className="nav-item" aria-label="Sair" data-dica="Sair">
              <Icone nome="sair" />
              <span className="rotulo">Sair</span>
            </button>
          </form>
        </div>
      </aside>

      <main className="conteudo">{children}</main>
    </div>
  );
}
