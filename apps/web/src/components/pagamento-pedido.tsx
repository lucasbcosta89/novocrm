"use client";

import { useState } from "react";
import { ROTULO_FORMA_PAGAMENTO, ROTULO_PRAZO } from "@/lib/rotulos";
import { FORMAS_PAGAMENTO, PRAZOS_PAGAMENTO } from "@/lib/validacao";

/** Forma de pagamento + prazo; "Prazo (dias)" só fica habilitado quando "À prazo". */
export function PagamentoPedido() {
  const [prazo, setPrazo] = useState<(typeof PRAZOS_PAGAMENTO)[number]>("a_vista");
  return (
    <>
      <label className="campo">
        <span>Forma de Pagamento</span>
        <select name="forma_pagamento" defaultValue="">
          <option value="">Selecione…</option>
          {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{ROTULO_FORMA_PAGAMENTO[f]}</option>)}
        </select>
      </label>
      <label className="campo">
        <span>Prazo de Pagamento</span>
        <select name="prazo_tipo" value={prazo} onChange={(e) => setPrazo(e.target.value as typeof prazo)}>
          {PRAZOS_PAGAMENTO.map((p) => <option key={p} value={p}>{ROTULO_PRAZO[p]}</option>)}
        </select>
      </label>
      <label className="campo">
        <span>Prazo (dias)</span>
        <input name="prazo_dias" type="number" min={1} max={365} step={1} disabled={prazo !== "a_prazo"} required={prazo === "a_prazo"}
          placeholder={prazo === "a_prazo" ? "Ex.: 30" : "—"} />
      </label>
    </>
  );
}
