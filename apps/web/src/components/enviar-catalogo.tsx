"use client";

import { useState } from "react";
import { enviarCatalogoNovaAbaAction } from "@/app/app/whatsapp-actions";
import { IconeWhatsApp } from "./catalogo-acoes";

/**
 * Envia o catálogo por WhatsApp abrindo o wa.me em NOVA ABA (o usuário não sai da plataforma).
 * A aba é aberta no clique (antes do await) para não ser bloqueada como pop-up.
 */
export function EnviarCatalogo({
  representadaId,
  clienteId,
  clientes,
  rotulo = "Enviar Catálogo por WhatsApp",
  compacto,
  icone,
}: {
  representadaId: string;
  clienteId?: string;
  clientes?: { id: string; nome: string }[];
  rotulo?: string;
  compacto?: boolean;
  icone?: boolean;
}) {
  const [escolhido, setEscolhido] = useState(clienteId ?? "");
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!escolhido) return setMsg({ erro: "Selecione o cliente" });
    setMsg(null);
    setEnviando(true);
    const aba = window.open("about:blank", "_blank");
    const r = await enviarCatalogoNovaAbaAction(representadaId, escolhido);
    setEnviando(false);
    if (r.url) {
      if (aba) aba.location.href = r.url;
      else window.open(r.url, "_blank", "noopener");
      setMsg({ ok: "WhatsApp aberto em nova aba" });
    } else {
      aba?.close();
      setMsg(r.erro ? { erro: r.erro } : { ok: r.ok });
    }
  }

  return (
    <div className={compacto ? "enviar-catalogo compacto" : "enviar-catalogo inline"}>
      {clientes && (
        <label className="campo">
          <span>Cliente</span>
          <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
            <option value="" disabled>Selecione o cliente…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
      )}
      <button type="button" className={compacto ? "btn-link" : icone ? "btn btn-whatsapp" : "btn btn-peq"} onClick={enviar} disabled={enviando}>
        <IconeWhatsApp /> {enviando ? "Abrindo…" : rotulo}
      </button>
      {msg?.erro && <small className="erro-campo">{msg.erro}</small>}
      {msg?.ok && <small className="txt-ok">{msg.ok}</small>}
    </div>
  );
}
