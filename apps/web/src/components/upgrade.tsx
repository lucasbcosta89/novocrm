"use client";

import { useRef } from "react";
import { iniciarAssinaturaAction } from "@/app/app/configurar/actions";
import { formatarMoeda } from "@/lib/formato";
import { ORDEM_PLANOS, PLANOS, ROTULO_RECURSO, type Recurso } from "@/lib/planos";

const NOME: Record<string, string> = { solo: "Solo", profissional: "Profissional", pro: "Pro" };
const DESTAQUES: Recurso[] = ["representadas", "clientes", "oportunidades", "conversas_mes", "pdf_mes"];

/** Cards de plano com botão que leva ao checkout do Mercado Pago. */
export function OpcoesPlano({ atual }: { atual: string }) {
  return (
    <div className="planos">
      {ORDEM_PLANOS.map((codigo) => {
        const p = PLANOS[codigo];
        const eAtual = codigo === atual;
        return (
          <form key={codigo} action={iniciarAssinaturaAction} className={`plano ${eAtual ? "plano-atual" : ""}`}>
            <input type="hidden" name="plano" value={codigo} />
            <h3>{NOME[codigo]}</h3>
            <p className="preco">{formatarMoeda(p.preco)}<span>/mês</span></p>
            <ul>
              {DESTAQUES.map((r) => (
                <li key={r}>{p.limites[r] ?? "Ilimitado"} {ROTULO_RECURSO[r].toLowerCase()}</li>
              ))}
            </ul>
            <button className="btn" type="submit">{eAtual ? "Assinar / renovar" : "Assinar"}</button>
          </form>
        );
      })}
    </div>
  );
}

/** Botão que abre o modal de upgrade. */
export function BotaoUpgrade({ atual, rotulo = "Fazer upgrade" }: { atual: string; rotulo?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn btn-peq" onClick={() => ref.current?.showModal()}>{rotulo}</button>
      <dialog ref={ref} className="modal" onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <div className="cabecalho">
          <h2>Escolha seu plano</h2>
          <button type="button" className="btn-link" onClick={() => ref.current?.close()} aria-label="Fechar">✕</button>
        </div>
        <p className="dica">Pagamento recorrente pelo Mercado Pago. O novo limite é liberado assim que o pagamento for aprovado.</p>
        <OpcoesPlano atual={atual} />
      </dialog>
    </>
  );
}
