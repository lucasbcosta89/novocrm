"use client";

import type { ReactNode } from "react";

/**
 * Botão de envio que pede confirmação antes (ações irreversíveis como excluir).
 * Com `icone`: botão só com ícone — `rotulo` vira aria-label e dica (tooltip).
 */
export function BotaoConfirmar({ texto, pergunta, className = "btn-link perigo", icone, rotulo }: {
  texto?: string; pergunta: string; className?: string; icone?: ReactNode; rotulo?: string;
}) {
  const botao = (
    <button
      type="submit"
      className={className}
      aria-label={icone ? rotulo ?? texto : undefined}
      onClick={(e) => { if (!window.confirm(pergunta)) e.preventDefault(); }}
    >
      {icone ?? texto}
    </button>
  );
  return icone ? <span className="com-dica" data-dica={rotulo ?? texto}>{botao}</span> : botao;
}
