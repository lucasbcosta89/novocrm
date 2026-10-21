"use client";

import { useState } from "react";
import { solicitarCatalogoPdfAction } from "@/app/app/representadas/documentos-actions";

/* Ícones (SVG inline, herdam a cor do botão) */
export const IconeDocumento = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" />
  </svg>
);
export const IconeColar = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
  </svg>
);
export const IconeWhatsApp = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.9 2.3 1 2.5c.1.2 1.7 2.6 4.1 3.6 1.5.7 2.1.7 2.9.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2z" />
  </svg>
);

/** Gera o catálogo PDF e baixa assim que fica pronto (cache: download imediato). Quota pdf_mes vale. */
export function BotaoCatalogoPdf({ representadaId, desabilitado }: { representadaId: string; desabilitado?: boolean }) {
  const [estado, setEstado] = useState<{ ocupado: boolean; msg?: string; erro?: string }>({ ocupado: false });

  async function gerar() {
    setEstado({ ocupado: true, msg: "Gerando PDF…" });
    const r = await solicitarCatalogoPdfAction(representadaId);
    if (r.erro || !r.id || !r.url) return setEstado({ ocupado: false, erro: r.erro ?? "Falha ao gerar" });
    let status = r.status;
    for (let i = 0; i < 60 && status === "gerando"; i++) {
      await new Promise((ok) => setTimeout(ok, 1500));
      const s = await fetch(`/api/documentos/${r.id}/status`).then((x) => x.json()).catch(() => null) as { status?: string; erro?: string } | null;
      status = s?.status;
      if (status === "falha") return setEstado({ ocupado: false, erro: s?.erro ?? "Falha ao gerar o PDF" });
    }
    if (status !== "pronto") return setEstado({ ocupado: false, erro: "O PDF está demorando; tente de novo em instantes." });
    window.location.href = r.url; // resposta é attachment: baixa sem sair da página
    setEstado({ ocupado: false, msg: "Download iniciado." });
  }

  return (
    <div className="acao-catalogo">
      <button type="button" className="btn" onClick={gerar} disabled={desabilitado || estado.ocupado}>
        <IconeDocumento /> {estado.ocupado ? "Gerando…" : "Gerar Catálogo PDF"}
      </button>
      {estado.erro && <small className="erro-campo">{estado.erro}</small>}
      {!estado.erro && estado.msg && <small className="dica">{estado.msg}</small>}
    </div>
  );
}

/** Copia o link público do catálogo (/c/slug) para a área de transferência. */
export function BotaoCatalogoWeb({ slug, publico }: { slug: string; publico: boolean }) {
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);

  async function copiar() {
    if (!publico) return setMsg({ erro: "Ative o catálogo digital (Início → Editar dados) para gerar o link." });
    const link = `${window.location.origin}/c/${slug}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // navegador sem permissão de clipboard: fallback com seleção de texto
      const t = document.createElement("textarea");
      t.value = link;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setMsg({ ok: "Link copiado para a área de transferência." });
  }

  return (
    <div className="acao-catalogo">
      <button type="button" className="btn" onClick={copiar}>
        <IconeColar /> Gerar Catálogo Web
      </button>
      {msg?.ok && <small className="txt-ok">{msg.ok}</small>}
      {msg?.erro && <small className="erro-campo">{msg.erro}</small>}
    </div>
  );
}
