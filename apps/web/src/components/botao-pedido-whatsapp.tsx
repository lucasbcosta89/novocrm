"use client";

import { useEffect, useState } from "react";
import { enviarPedidoPdfAction } from "@/app/app/whatsapp-actions";
import { Icone } from "./icones";

/** "(62) 99999-8888" a partir do telefone cadastrado (só para a confirmação). */
function telefoneVisivel(t: string): string {
  const d = t.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

/**
 * Botão só com o ícone do WhatsApp: confirma, gera (ou reusa) o PDF do pedido e envia como documento.
 * Sem telefone → desabilitado com dica. Sem Cloud API → abre o wa.me com o link do PDF.
 */
export function BotaoPedidoWhatsApp({ pedidoId, numero, cliente, telefone }: { pedidoId: string; numero: string; cliente: string; telefone: string | null }) {
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  async function enviar() {
    if (!telefone) return;
    if (!window.confirm(`Enviar o pedido nº ${numero} para ${cliente} no WhatsApp ${telefoneVisivel(telefone)}?`)) return;
    setEnviando(true);
    const r = await enviarPedidoPdfAction(pedidoId);
    setEnviando(false);
    if (r.erro) return setAviso({ tipo: "erro", texto: r.erro });
    if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
    setAviso({ tipo: "ok", texto: r.ok ?? "Pedido enviado" });
  }

  const dica = !telefone ? "Cliente sem telefone cadastrado" : enviando ? "Enviando…" : "Enviar pedido por WhatsApp";
  return (
    <>
      <span className="com-dica" data-dica={dica}>
        <button type="button" className="botao-icone botao-whatsapp" aria-label={dica} disabled={!telefone || enviando} aria-busy={enviando} onClick={enviar}>
          {enviando ? <span className="girando" aria-hidden="true" /> : <Icone nome="whatsapp" tamanho={18} />}
        </button>
      </span>
      {aviso && (
        <div className={`toast toast-${aviso.tipo}`} role={aviso.tipo === "erro" ? "alert" : "status"}>
          <Icone nome={aviso.tipo === "erro" ? "alerta" : "check"} tamanho={16} />
          <span>{aviso.texto}</span>
          <button type="button" className="btn-link" aria-label="Fechar aviso" onClick={() => setAviso(null)}><Icone nome="fechar" tamanho={14} /></button>
        </div>
      )}
    </>
  );
}
