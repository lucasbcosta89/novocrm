"use client";

/** Botão de envio que pede confirmação antes (ações irreversíveis como excluir). */
export function BotaoConfirmar({ texto, pergunta, className = "btn-link perigo" }: { texto: string; pergunta: string; className?: string }) {
  return (
    <button type="submit" className={className} onClick={(e) => { if (!window.confirm(pergunta)) e.preventDefault(); }}>
      {texto}
    </button>
  );
}
