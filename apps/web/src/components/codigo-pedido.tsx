"use client";

import { useEffect, useRef, useState } from "react";

const MSG_DUPLICADO = "Já existe um pedido com este código";

/**
 * Código do Pedido (Fase 14).
 * Novo pedido: checkbox "Gerar Código do Pedido" (marcado) bloqueia o campo e mostra o próximo código como
 * preview — o código real é gravado no servidor ao salvar. Desmarcado: campo obrigatório para o código do ERP.
 * Edição: código externo é editável; código gerado fica bloqueado.
 * Antes de enviar, um código digitado é checado (GET /api/pedidos/codigo): duplicado mostra o erro aqui,
 * sem sair da página nem perder os itens preenchidos. A unique do banco continua sendo a garantia final.
 */
export function CodigoPedido({ proximo, atual, gerado = true, pedidoId }: {
  proximo?: string; atual?: string; gerado?: boolean; pedidoId?: string;
}) {
  const edicao = !!pedidoId;
  const [gerar, setGerar] = useState(edicao ? gerado : true);
  const [valor, setValor] = useState(edicao && !gerado ? atual ?? "" : "");
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const liberado = useRef(false);

  // desmarcar o checkbox: foco automático no campo
  const [focar, setFocar] = useState(false);
  useEffect(() => {
    if (focar && !gerar) ref.current?.focus();
  }, [focar, gerar]);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form || gerar) return;
    async function aoEnviar(e: SubmitEvent) {
      if (liberado.current) { liberado.current = false; return; }
      const codigo = ref.current?.value.trim() ?? "";
      if (!codigo) return; // "required" do campo já bloqueia
      e.preventDefault();
      const submitter = e.submitter;
      try {
        const qs = new URLSearchParams({ codigo, ...(pedidoId ? { ignorar: pedidoId } : {}) });
        const r = await fetch(`/api/pedidos/codigo?${qs}`);
        const json = (await r.json().catch(() => null)) as { disponivel?: boolean } | null;
        if (r.ok && json?.disponivel === false) {
          setErro(MSG_DUPLICADO);
          ref.current?.focus();
          return;
        }
      } catch {
        // sem rede para checar: o servidor valida ao salvar
      }
      liberado.current = true;
      form!.requestSubmit(submitter instanceof HTMLElement ? submitter : undefined);
    }
    form.addEventListener("submit", aoEnviar);
    return () => form.removeEventListener("submit", aoEnviar);
  }, [gerar, pedidoId]);

  return (
    <>
      {!edicao && (
        <label className="check">
          <input
            type="checkbox"
            name="gerar_codigo"
            value="1"
            checked={gerar}
            onChange={(e) => { setGerar(e.target.checked); setErro(null); setFocar(!e.target.checked); }}
          />
          Gerar Código do Pedido
        </label>
      )}
      <label className="campo">
        <span>Código do Pedido{!gerar && " *"}</span>
        <input
          ref={ref}
          name="codigo_pedido"
          value={gerar ? (edicao ? atual ?? "" : proximo ?? "") : valor}
          onChange={(e) => { setValor(e.target.value); setErro(null); }}
          disabled={gerar}
          required={!gerar}
          maxLength={40}
          placeholder={gerar ? undefined : "Código do pedido no ERP"}
          aria-invalid={!!erro}
          aria-describedby={erro ? "erro-codigo-pedido" : undefined}
        />
        {erro && <small id="erro-codigo-pedido" className="erro-campo" role="alert">{erro}</small>}
        {!erro && gerar && <small className="dica">{edicao ? "Código gerado pela plataforma; não pode ser alterado." : "Próximo código da série; confirmado ao salvar."}</small>}
      </label>
    </>
  );
}
