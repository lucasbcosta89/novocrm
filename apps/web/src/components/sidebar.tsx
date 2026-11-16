"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { COOKIE_SIDEBAR, GRUPOS_MENU, ITEM_COMO_USAR, ITEM_SAIR, ITENS_CONTA, type GrupoMenu, type ItemMenu } from "@/lib/navegacao";
import { BotaoTema } from "./botao-tema";
import { Icone } from "./icones";
import { LogoSimbolo } from "./logo";

type Item = ItemMenu;
type Pendencias = { pedidos: number; comissoes: number };
const CHAVE_GRUPOS = "menu-grupos";

/** Fase 23.3: altura da janela (agrupamento compacto abaixo de 700px; só ícone + rótulo abaixo de 620px). */
const assinarAltura = (avisar: () => void) => { window.addEventListener("resize", avisar); return () => window.removeEventListener("resize", avisar); };
const alturaJanela = () => window.innerHeight;
const EVENTO_GRUPOS = "menu-grupos-alterado";
const assinarGrupos = (avisar: () => void) => { window.addEventListener(EVENTO_GRUPOS, avisar); return () => window.removeEventListener(EVENTO_GRUPOS, avisar); };
const lerGrupos = () => { try { return localStorage.getItem(CHAVE_GRUPOS) ?? "{}"; } catch { return "{}"; } };
const selo = (n: number) => (n > 99 ? "99+" : String(n));

/**
 * Casca da área logada: sidebar azul (expande 248px / recolhe 72px), barra superior no celular
 * com gaveta + overlay, e o conteúdo da página.
 */
export function Shell({ nome, colapsadaInicial, pendencias = { pedidos: 0, comissoes: 0 }, children }: {
  nome: string | null; colapsadaInicial: boolean; pendencias?: Pendencias; children: React.ReactNode;
}) {
  const caminho = usePathname();
  const altura = useSyncExternalStore(assinarAltura, alturaJanela, () => 900);
  // grupos abertos (por usuário, neste navegador); o grupo da rota ativa abre sempre
  const brutoGrupos = useSyncExternalStore(assinarGrupos, lerGrupos, () => "{}");
  const gruposSalvos = useMemo(() => { try { return JSON.parse(brutoGrupos) as Record<string, boolean | string | null>; } catch { return {} as Record<string, boolean | string | null>; } }, [brutoGrupos]);
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

  const grupoAtivo = GRUPOS_MENU.find((g) => g.itens.some((i) => i.href && ativo(i.href)))?.id;
  const baixa = altura < 700;
  // zero rolagem: abaixo de 900px os grupos viram acordeão (só o último aberto, além do grupo ativo); abaixo de 700px
  // só o grupo da rota ativa. Acima de 900px vale o estado salvo (padrão: só o ativo). O grupo ativo abre sempre.
  const exclusivo = altura < 900;
  const ultimo = typeof gruposSalvos._ultimo === "string" ? gruposSalvos._ultimo : null;
  const grupoAberto = (g: GrupoMenu) =>
    g.id === grupoAtivo || (!baixa && gruposSalvos[g.id] === true && (!exclusivo || g.id === ultimo));
  function alternarGrupo(g: GrupoMenu) {
    if (g.id === grupoAtivo) return; // o item ativo nunca fica escondido
    const abrir = !grupoAberto(g);
    const novo = exclusivo && abrir
      ? { ...Object.fromEntries(Object.keys(gruposSalvos).map((k) => [k, false])), [g.id]: true, _ultimo: g.id }
      : { ...gruposSalvos, [g.id]: abrir, _ultimo: abrir ? g.id : ultimo };
    try { localStorage.setItem(CHAVE_GRUPOS, JSON.stringify(novo)); } catch { /* sem storage */ }
    window.dispatchEvent(new Event(EVENTO_GRUPOS));
  }
  const badge = (i: Item) => (i.pendencia ? pendencias[i.pendencia] : 0);

  const link = (i: Item) => i.href ? (
    <Link
      key={i.href}
      href={i.href}
      className={ativo(i.href) ? "nav-item ativo" : "nav-item"}
      aria-current={ativo(i.href) ? "page" : undefined}
      aria-label={badge(i) ? `${i.rotulo} (${badge(i)} pendente(s))` : i.rotulo}
      data-dica={i.rotulo}
      title={i.rotulo}
      onClick={() => setGavetaAberta(false)}
    >
      <Icone nome={i.icone} tamanho={18} />
      <span className="rotulo">{i.rotulo}</span>
      {badge(i) > 0 && <span className="nav-selo" aria-hidden="true">{selo(badge(i))}</span>}
    </Link>
  ) : (
    <form key="sair" action="/auth/signout" method="post">
      <button type="submit" className="nav-item" aria-label={i.rotulo} data-dica={i.rotulo} title={i.rotulo}>
        <Icone nome={i.icone} tamanho={18} />
        <span className="rotulo">{i.rotulo}</span>
      </button>
    </form>
  );

  return (
    <div className={`shell${colapsada ? " colapsada" : ""}${gavetaAberta ? " gaveta-aberta" : ""}${altura < 700 ? " menu-baixo" : ""}${altura < 620 ? " menu-minimo" : ""}`}>
      <header className="barra-topo">
        <button type="button" className="botao-icone" aria-label="Abrir menu" aria-expanded={gavetaAberta} aria-controls="sidebar" onClick={() => setGavetaAberta(true)}>
          <Icone nome="menu" tamanho={22} />
        </button>
        <Link href="/app" className="barra-topo-marca"><LogoSimbolo tamanho={28} /> Plurima</Link>
      </header>

      <div className="overlay" aria-hidden="true" onClick={() => setGavetaAberta(false)} />

      <aside className="sidebar" id="sidebar" aria-label="Menu principal">
        <div className="sidebar-topo">
          <Link href="/app" className="marca" aria-label="Plurima — Dashboard">
            <LogoSimbolo />
            <span className="rotulo">Plurima</span>
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

        {/* MEIO: grupos recolhíveis, sem rolagem (a altura compacta em vez de rolar) */}
        <nav className="sidebar-nav" aria-label="Navegação">
          {GRUPOS_MENU.map((g) => {
            const aberto = grupoAberto(g);
            const pend = g.itens.reduce((t, i) => t + badge(i), 0);
            return (
              <div key={g.id} className={`nav-grupo${aberto ? " aberto" : ""}`}>
                <button type="button" className="nav-grupo-cabecalho" aria-expanded={aberto} aria-controls={`grupo-${g.id}`} onClick={() => alternarGrupo(g)}>
                  <span className="rotulo">{g.rotulo}</span>
                  {!aberto && pend > 0 && <span className="nav-selo nav-selo-grupo" aria-label={`${pend} pendente(s)`}>{selo(pend)}</span>}
                  <span className={`nav-chevron${aberto ? " aberto" : ""}`} aria-hidden="true">▾</span>
                </button>
                <div id={`grupo-${g.id}`} className="nav-grupo-itens" hidden={!aberto}>{g.itens.map(link)}</div>
              </div>
            );
          })}
        </nav>

        {/* RODAPÉ FIXO em três blocos (nunca recolhe, nunca rola): conta · tema e sair · como usar */}
        <div className="sidebar-rodape">
          <div className="sidebar-bloco">{ITENS_CONTA.map(link)}</div>
          <hr className="sidebar-divisor" />
          <div className="sidebar-bloco"><BotaoTema />{link(ITEM_SAIR)}</div>
          <hr className="sidebar-divisor" />
          <div className="sidebar-bloco">{link(ITEM_COMO_USAR)}</div>
        </div>
      </aside>

      <main className="conteudo">{children}</main>
    </div>
  );
}
