"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { salvarOnboardingAction } from "@/app/app/onboarding-actions";
import { PASSOS_ONBOARDING } from "@/lib/guia/onboarding";
import { Icone } from "./icones";

/** Evento para "Rever o passo a passo" (página Como usar): reabre do passo 1 sem apagar o estado salvo. */
export const EVENTO_REVER_ONBOARDING = "plurima:rever-onboarding";
/** nunca abrir automaticamente por cima de importação ou formulário em edição */
const ROTA_EDICAO = /\/(importar|nova|novo|editar)(\/|$)/;

/**
 * Fase 23.2 — passo a passo do primeiro login: painel lateral (até 480px) que NUNCA bloqueia o uso (sempre há Pular).
 * Retomável (a etapa fica salva no banco); "Pular" vale em qualquer navegador; Esc fecha; foco preso no painel
 * enquanto aberto e devolvido ao fechar. Em revisão, nada é gravado.
 */
export function Onboarding({ inicial }: { inicial: { concluido: boolean; pulado: boolean; etapa: number } }) {
  const router = useRouter();
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const [passo, setPasso] = useState(Math.min(inicial.etapa, PASSOS_ONBOARDING.length - 1));
  const [revisao, setRevisao] = useState(false);
  const painel = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<Element | null>(null);

  // abertura automática (na carga da página): não concluído, não pulado, fora de telas de edição. Fechar no meio
  // salva a etapa; a próxima carga reabre dali. Pulado nunca reabre (vale em qualquer navegador).
  useEffect(() => {
    if (inicial.concluido || inicial.pulado) return;
    if (ROTA_EDICAO.test(caminho) || document.querySelector("dialog[open]")) return;
    const t = setTimeout(() => setAberto(true), 400);
    return () => clearTimeout(t);
    // só na carga inicial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const rever = () => { setRevisao(true); setPasso(0); setAberto(true); };
    window.addEventListener(EVENTO_REVER_ONBOARDING, rever);
    return () => window.removeEventListener(EVENTO_REVER_ONBOARDING, rever);
  }, []);

  const fechar = useCallback(() => {
    setAberto(false);
    if (!revisao) void salvarOnboardingAction({ acao: "etapa", etapa: passo });
  }, [passo, revisao]);

  // foco: entra no painel, fica preso (Tab), Esc fecha, volta ao elemento anterior
  useEffect(() => {
    if (!aberto) return;
    focoAnterior.current = document.activeElement;
    painel.current?.querySelector<HTMLElement>("[data-foco-inicial]")?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); fechar(); return; }
      if (e.key !== "Tab" || !painel.current) return;
      const focaveis = [...painel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      if (!focaveis.length) return;
      const [primeiro, ultimo] = [focaveis[0]!, focaveis[focaveis.length - 1]!];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      (focoAnterior.current as HTMLElement | null)?.focus?.();
    };
  }, [aberto, fechar]);

  if (!aberto) return null;
  const p = PASSOS_ONBOARDING[passo]!;
  const total = PASSOS_ONBOARDING.length;
  const irPara = (n: number) => { setPasso(n); if (!revisao) void salvarOnboardingAction({ acao: "etapa", etapa: n }); };
  function pular() {
    setAberto(false);
    if (!revisao) void salvarOnboardingAction({ acao: "pular" });
  }
  function concluir() {
    setAberto(false);
    if (!revisao) void salvarOnboardingAction({ acao: "concluir" });
  }
  function irParaPagina(href: string) {
    router.push(href);
    // destaque visual na tela de destino (título da página)
    setTimeout(() => {
      const alvo = document.querySelector("main.conteudo h1");
      alvo?.classList.add("destaque-onboarding");
      setTimeout(() => alvo?.classList.remove("destaque-onboarding"), 2600);
    }, 700);
  }

  return (
    <div ref={painel} className="onboarding" role="dialog" aria-modal="false" aria-labelledby="onboarding-titulo">
      <div className="onboarding-topo">
        <span className="dica">{passo + 1} de {total}</span>
        <button type="button" className="botao-icone" aria-label="Fechar passo a passo" onClick={fechar}><Icone nome="fechar" tamanho={18} /></button>
      </div>
      <div className="barra onboarding-progresso" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={passo + 1} aria-label="Progresso do passo a passo">
        <span style={{ width: `${((passo + 1) / total) * 100}%` }} />
      </div>
      <h2 id="onboarding-titulo" tabIndex={-1} data-foco-inicial>{p.titulo}</h2>
      {p.texto.map((t) => <p key={t}>{t}</p>)}
      {p.downloads && (
        <ul className="onboarding-downloads">
          {p.downloads.map((d) => (
            <li key={d.href}><a href={d.href} download><Icone nome="download" tamanho={16} /> {d.rotulo}</a></li>
          ))}
        </ul>
      )}
      {p.href && <button type="button" className="btn-link" onClick={() => irParaPagina(p.href!)}>Ir para a página <Icone nome="expandir" tamanho={14} /></button>}
      <div className="onboarding-acoes">
        {passo === 0 ? (
          <button type="button" className="btn" onClick={() => irPara(1)}>Começar</button>
        ) : (
          <>
            <button type="button" className="btn-secundario btn-peq" onClick={() => irPara(passo - 1)}>Voltar</button>
            {passo < total - 1
              ? <button type="button" className="btn btn-peq" onClick={() => irPara(passo + 1)}>Avançar</button>
              : <button type="button" className="btn btn-peq" onClick={concluir}>Concluir</button>}
          </>
        )}
        <button type="button" className="btn-link" onClick={pular}>{revisao ? "Fechar" : "Pular tutorial"}</button>
      </div>
    </div>
  );
}

/** Botão "Rever o passo a passo" (rodapé da página Como usar). */
export function BotaoReverOnboarding() {
  return (
    <button type="button" className="btn-secundario" onClick={() => window.dispatchEvent(new Event(EVENTO_REVER_ONBOARDING))}>
      <Icone nome="historico" tamanho={16} /> Rever o passo a passo
    </button>
  );
}
