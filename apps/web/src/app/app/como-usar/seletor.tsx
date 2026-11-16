"use client";

import { useEffect } from "react";

/** Telas estreitas: as âncoras laterais viram um select que rola até a etapa (e a abre). */
export function SeletorEtapas({ etapas }: { etapas: { id: string; titulo: string }[] }) {
  // âncora para etapa recolhida: abre o bloco (links laterais, #hash na URL)
  useEffect(() => {
    const abrir = () => { const a = document.getElementById(location.hash.slice(1)); if (a instanceof HTMLDetailsElement) a.open = true; };
    abrir();
    window.addEventListener("hashchange", abrir);
    return () => window.removeEventListener("hashchange", abrir);
  }, []);
  function ir(id: string) {
    if (!id) return;
    const alvo = document.getElementById(id);
    if (alvo instanceof HTMLDetailsElement) alvo.open = true;
    alvo?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  }
  return (
    <label className="campo guia-seletor">
      <span>Ir para a etapa</span>
      <select defaultValue="" onChange={(e) => ir(e.target.value)}>
        <option value="">Escolha…</option>
        {etapas.map((e) => <option key={e.id} value={e.id}>{e.titulo}</option>)}
        <option value="perguntas">Perguntas frequentes</option>
      </select>
    </label>
  );
}
