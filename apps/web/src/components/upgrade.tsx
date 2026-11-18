"use client";

import { useRef } from "react";
import { iniciarAssinaturaAction } from "@/app/app/configurar/actions";
import { formatarMoeda } from "@/lib/formato";
import { CICLOS, ECONOMIA_ANUAL, ORDEM_CICLOS, PLANO, type Ciclo } from "@/lib/planos";

const BENEFICIOS = [
  "Representadas, clientes e produtos ilimitados",
  "Pedidos, importação por Excel e comissões completas",
  "Relatórios, catálogos em PDF e análises",
  "Todas as funcionalidades, sem plano inferior",
];

/** Cards do plano único (mensal / anual) com botão que leva ao checkout do Mercado Pago. */
export function OpcoesPlano({ atual }: { atual?: Ciclo | null }) {
  return (
    <div className="planos">
      {ORDEM_CICLOS.map((ciclo) => {
        const c = CICLOS[ciclo];
        const eAtual = ciclo === atual;
        return (
          <form key={ciclo} action={iniciarAssinaturaAction} className={`plano ${ciclo === "anual" ? "plano-destaque" : ""} ${eAtual ? "plano-atual" : ""}`}>
            <input type="hidden" name="ciclo" value={ciclo} />
            <h3>{PLANO.nome} {c.rotulo}</h3>
            <p className="preco">{formatarMoeda(c.valorMensal)}<span>/mês</span></p>
            <p className="dica">
              {ciclo === "anual" ? `${formatarMoeda(c.cobranca)} cobrados por ano · economia de ${ECONOMIA_ANUAL}%` : "Cobrança mensal, cancele quando quiser"}
            </p>
            <ul>{BENEFICIOS.map((b) => <li key={b}>{b}</li>)}</ul>
            <button className="btn" type="submit">{eAtual ? "Renovar" : `Assinar ${c.rotulo.toLowerCase()}`}</button>
          </form>
        );
      })}
    </div>
  );
}

/** Botão que abre o modal de assinatura (paywall). */
export function BotaoUpgrade({ rotulo = "Assinar a Plurima" }: { atual?: string; rotulo?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn btn-peq" onClick={() => ref.current?.showModal()}>{rotulo}</button>
      <dialog ref={ref} className="modal" onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <div className="cabecalho">
          <h2>Assine a Plurima</h2>
          <button type="button" className="btn-link" onClick={() => ref.current?.close()} aria-label="Fechar">✕</button>
        </div>
        <p className="dica">Pagamento recorrente pelo Mercado Pago. O acesso completo é liberado assim que o pagamento é aprovado.</p>
        <OpcoesPlano />
      </dialog>
    </>
  );
}
