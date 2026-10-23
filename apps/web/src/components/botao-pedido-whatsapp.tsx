"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/app/app/oportunidades/comum";
import { linkPedidoWhatsApp } from "@/lib/whatsapp";
import { Icone } from "./icones";

/**
 * Botão só com o ícone do WhatsApp (Fase 12b): modal curto → no mesmo clique, dispara o download do
 * PDF do pedido (gera ou reusa do cache) e abre o wa.me em NOVA aba com a mensagem pronta.
 * Sem telefone ou número inválido → desabilitado com o motivo na dica.
 */
export function BotaoPedidoWhatsApp({ pedidoId, numero, cliente, telefone, total }: {
  pedidoId: string; numero: string; cliente: string; telefone: string | null; total: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const link = linkPedidoWhatsApp(telefone, cliente, numero, total);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  function continuar() {
    if (!("url" in link)) return;
    setAberto(false);
    setBaixando(true);
    // (1) download do PDF — a requisição sai antes da nova aba; o arquivo é salvo quando chegar
    const pdf = fetch(`/api/pedidos/${pedidoId}/pdf?envio=whatsapp`);
    // (2) wa.me em nova aba, ainda dentro do clique (não é bloqueado como popup)
    window.open(link.url, "_blank", "noopener,noreferrer");
    pdf
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erro?: string }).erro ?? "Falha ao gerar o PDF");
        const nome = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? `pedido-${numero}.pdf`;
        const url = URL.createObjectURL(await r.blob());
        const a = Object.assign(document.createElement("a"), { href: url, download: nome });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setAviso({ tipo: "ok", texto: `PDF do pedido nº ${numero} baixado. Anexe o arquivo na conversa do WhatsApp.` });
      })
      .catch((e: unknown) => setAviso({ tipo: "erro", texto: e instanceof Error ? e.message : "Falha ao baixar o PDF" }))
      .finally(() => setBaixando(false));
  }

  const dica = "motivo" in link ? link.motivo : baixando ? "Baixando o PDF…" : "Enviar pedido por WhatsApp";
  return (
    <>
      <span className="com-dica" data-dica={dica}>
        <button type="button" className="botao-icone botao-whatsapp" aria-label={dica} disabled={"motivo" in link || baixando} aria-busy={baixando}
          onClick={() => setAberto(true)}>
          {baixando ? <span className="girando" aria-hidden="true" /> : <Icone nome="whatsapp" tamanho={18} />}
        </button>
      </span>
      {aberto && (
        <Modal titulo={`Enviar pedido nº ${numero}`} onFechar={() => setAberto(false)} largo={false}>
          <div className="grade-1">
            <p>O PDF do pedido será baixado. Anexe o arquivo na conversa do WhatsApp que abrirá em seguida.</p>
            <div className="acoes-linha">
              <button type="button" className="btn btn-whatsapp" onClick={continuar}><Icone nome="whatsapp" tamanho={16} /> Continuar</button>
              <button type="button" className="btn-link" onClick={() => setAberto(false)}>Cancelar</button>
            </div>
          </div>
        </Modal>
      )}
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
