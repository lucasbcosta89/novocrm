"use client";

import { useRef } from "react";
import { iniciarAssinaturaAction } from "@/app/app/configurar/actions";
import { formatarMoeda } from "@/lib/formato";
import { economia, FORMAS, type Ciclo, type Forma } from "@/lib/planos";

const BENEFICIOS = [
  "Representadas, clientes e produtos ilimitados",
  "Pedidos, importação por Excel e comissões",
  "Relatórios, catálogos em PDF e análises",
];

const GRUPOS: { ciclo: Ciclo; titulo: string; formas: Forma[] }[] = [
  { ciclo: "mensal", titulo: "Mensal", formas: ["pix_mensal", "cartao_mensal"] },
  { ciclo: "anual", titulo: "Anual", formas: ["pix_anual", "cartao_anual"] },
];

/** Descrição sempre em 2 linhas (uma por item) para os 4 blocos ficarem alinhados entre os cards Mensal e Anual. */
function detalhe(forma: Forma): [string, string] {
  switch (forma) {
    case "cartao_mensal": return ["Cobrado todo mês no cartão.", "Cancele quando quiser."];
    case "pix_mensal": return ["Pagamento único de 1 mês.", "Renove pelo Pix quando vencer."];
    case "cartao_anual": return [`Total de ${formatarMoeda(FORMAS.cartao_anual.cobranca)}, sem juros.`, "12 meses de acesso."];
    case "pix_anual": return [`${formatarMoeda(FORMAS.pix_anual.cobranca)} à vista no Pix.`, "12 meses de acesso."];
  }
}

/** Paywall: as 4 formas de pagamento do plano único, agrupadas em Mensal e Anual, com Pix e cartão lado a lado. */
export function OpcoesPlano({ atual }: { atual?: Forma | null }) {
  return (
    <div className="planos planos-formas">
      {GRUPOS.map((g) => (
        <div key={g.ciclo} className={`plano ${g.ciclo === "anual" ? "plano-destaque" : ""}`}>
          <div className="plano-topo">
            <h3>{g.titulo}</h3>
            {g.ciclo === "anual" && <span className="selo-plano">Menor preço · até {economia("pix_anual")}% off</span>}
          </div>
          {g.formas.map((forma) => {
            const f = FORMAS[forma];
            const eAtual = forma === atual;
            return (
              <form key={forma} action={iniciarAssinaturaAction} className={`forma-pagamento ${eAtual ? "plano-atual" : ""}`}>
                <input type="hidden" name="forma" value={forma} />
                <div className="forma-info">
                  <span className="forma-meio">{f.meio === "pix" ? "Pix" : "Cartão de crédito"}</span>
                  <p className="preco">
                    {f.parcelas > 1 && <small>12x </small>}
                    {formatarMoeda(f.valorMensal)}
                    <span>{f.parcelas > 1 ? "" : "/mês"}</span>
                  </p>
                  <p className="dica forma-detalhe">{detalhe(forma).map((linha) => <span key={linha}>{linha}</span>)}</p>
                </div>
                <button className={f.meio === "pix" ? "btn" : "btn-secundario"} type="submit" disabled={eAtual && f.recorrente}>
                  {eAtual && f.recorrente ? "Assinatura atual" : f.meio === "pix" ? "Pagar com Pix" : f.recorrente ? "Assinar no cartão" : "Pagar no cartão"}
                </button>
              </form>
            );
          })}
        </div>
      ))}
      <ul className="planos-beneficios">
        {BENEFICIOS.map((b) => <li key={b}>{b}</li>)}
        <li>Mesmo plano em todas as opções: muda só a forma de pagamento</li>
      </ul>
    </div>
  );
}

/** Botão que abre o modal de assinatura (paywall). */
export function BotaoUpgrade({ rotulo = "Assinar a Plurima" }: { rotulo?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn btn-peq" onClick={() => ref.current?.showModal()}>{rotulo}</button>
      <dialog ref={ref} className="modal" onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <div className="cabecalho">
          <h2>Assine a Plurima</h2>
          <button type="button" className="btn-link" onClick={() => ref.current?.close()} aria-label="Fechar">✕</button>
        </div>
        <p className="dica">Pagamento pelo Mercado Pago. O acesso completo é liberado assim que o pagamento é aprovado.</p>
        <OpcoesPlano />
      </dialog>
    </>
  );
}
