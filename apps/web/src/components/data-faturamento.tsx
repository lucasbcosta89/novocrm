"use client";

import { useState } from "react";

/**
 * Fase 19 — "Data de Faturamento" (opcional). Aceita data passada, presente ou futura, sem regra de ordem:
 * só um texto auxiliar quando o faturamento é anterior à data do pedido. Não entra em nenhum cálculo.
 */
export function CampoDataFaturamento({ valor, dataPedido }: { valor?: string | null; dataPedido: string }) {
  const [v, setV] = useState(valor ?? "");
  const antes = !!v && v < dataPedido.slice(0, 10);
  return (
    <label className="campo" htmlFor="data_faturamento">
      <span>Data de Faturamento</span>
      <input id="data_faturamento" type="date" name="data_faturamento" value={v} onChange={(e) => setV(e.target.value)}
        aria-describedby="data_faturamento-dica" />
      <small id="data_faturamento-dica" className="dica">
        {antes ? "Faturamento anterior à data do pedido." : "Opcional: pode ser preenchida depois."}
      </small>
    </label>
  );
}
