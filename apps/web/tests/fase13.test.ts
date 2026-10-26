import { describe, expect, it } from "vitest";
import { ROTULO_MOTIVO_DEVOLUCAO, ROTULO_STATUS_DEVOLUCAO } from "@/lib/rotulos";
import { devolucaoSchema, MOTIVOS_DEVOLUCAO, STATUS_DEVOLUCAO, subtotalItem } from "@/lib/validacao";

const CLI = "33333333-3333-4333-8333-333333333333";
const REP = "11111111-1111-4111-8111-111111111111";
const PED = "44444444-4444-4444-8444-444444444444";
const PROD = "55555555-5555-4555-8555-555555555555";
const base = {
  cliente_id: CLI, representada_id: REP, pedido_id: "", data: "2026-10-25", motivo: "produto_avariado",
  forma_pagamento: "", prazo_tipo: "a_vista", prazo_dias: "", observacoes: "",
  itens: [{ produto_id: PROD, quantidade: "2", preco_unitario: "100", desconto_percentual: "10" }],
};

describe("devoluções (fase 13)", () => {
  it("devolução avulsa: pedido vazio vira null e status padrão é pendente", () => {
    const d = devolucaoSchema.parse(base);
    expect(d).toMatchObject({ pedido_id: null, status: "pendente", forma_pagamento: null, prazo_dias: null, observacoes: null });
    expect(d.itens[0]).toMatchObject({ quantidade: 2, preco_unitario: 100, desconto_percentual: 10 });
  });

  it("devolução vinculada a pedido, à prazo", () => {
    const d = devolucaoSchema.parse({ ...base, pedido_id: PED, status: "aprovada", prazo_tipo: "a_prazo", prazo_dias: "30" });
    expect(d).toMatchObject({ pedido_id: PED, status: "aprovada", prazo_dias: 30 });
  });

  it("validações: motivo, status, data, itens e prazo", () => {
    expect(devolucaoSchema.safeParse({ ...base, motivo: "" }).success).toBe(false);
    expect(devolucaoSchema.safeParse({ ...base, status: "cancelada" }).success).toBe(false);
    expect(devolucaoSchema.safeParse({ ...base, data: "" }).success).toBe(false);
    expect(devolucaoSchema.safeParse({ ...base, itens: [] }).success).toBe(false);
    expect(devolucaoSchema.safeParse({ ...base, prazo_tipo: "a_prazo", prazo_dias: "" }).success).toBe(false);
    expect(devolucaoSchema.safeParse({ ...base, itens: [{ ...base.itens[0], quantidade: "0" }] }).success).toBe(false);
  });

  it("subtotal com a mesma regra do pedido; total = soma dos subtotais", () => {
    const itens = [subtotalItem(2, 100, 10), subtotalItem(1, 33.33, 0)];
    expect(itens).toEqual([180, 33.33]);
    expect(Math.round(itens.reduce((t, s) => t + s, 0) * 100) / 100).toBe(213.33);
  });

  it("rótulos cobrem todos os motivos e status", () => {
    for (const m of MOTIVOS_DEVOLUCAO) expect(ROTULO_MOTIVO_DEVOLUCAO[m]).toBeTruthy();
    for (const s of STATUS_DEVOLUCAO) expect(ROTULO_STATUS_DEVOLUCAO[s]).toBeTruthy();
  });
});
