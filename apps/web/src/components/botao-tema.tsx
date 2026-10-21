"use client";

import { useSyncExternalStore } from "react";
import { Icone, type NomeIcone } from "./icones";

/** Tema da tela: Claro (padrão) → Escuro → Sistema. Salvo no navegador (localStorage "tema"). */
type Tema = "claro" | "escuro" | "sistema";

const PROXIMO: Record<Tema, Tema> = { claro: "escuro", escuro: "sistema", sistema: "claro" };
const ROTULO: Record<Tema, string> = { claro: "Tema: Claro", escuro: "Tema: Escuro", sistema: "Tema: Sistema" };
const ICONE: Record<Tema, NomeIcone> = { claro: "sol", escuro: "lua", sistema: "monitor" };

const EVENTO = "tema-alterado";
const lerTema = (): Tema => (document.documentElement.dataset.tema as Tema | undefined) ?? "claro";
const assinar = (avisar: () => void) => {
  window.addEventListener(EVENTO, avisar);
  return () => window.removeEventListener(EVENTO, avisar);
};

export function BotaoTema() {
  const tema = useSyncExternalStore(assinar, lerTema, () => "claro" as Tema);

  function trocar() {
    const novo = PROXIMO[tema];
    document.documentElement.dataset.tema = novo;
    try {
      localStorage.setItem("tema", novo);
    } catch {
      // navegador sem armazenamento: o tema vale só nesta visita
    }
    window.dispatchEvent(new Event(EVENTO));
  }

  return (
    <button type="button" className="nav-item" aria-label={`${ROTULO[tema]} (clique para trocar)`} data-dica={ROTULO[tema]} onClick={trocar}>
      <Icone nome={ICONE[tema]} />
      <span className="rotulo">{ROTULO[tema]}</span>
    </button>
  );
}
