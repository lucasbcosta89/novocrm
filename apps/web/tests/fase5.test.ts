import { describe, expect, it } from "vitest";
import { marcarComissaoSchema, pedidoSchema, produtoSchema } from "@/lib/validacao";
import { resumirComissoes, type Comissao } from "@/server/comissoes";

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";

describe("pedidoSchema", () => {
  it("converte quantidades/desconto e exige itens", () => {
    const p = pedidoSchema.parse({ representada_id: R1, cliente_id: R2, itens: [{ produto_id: P, quantidade: "2", desconto: "1,5" }] });
    expect(p.itens[0]).toEqual({ produto_id: P, quantidade: 2, desconto: 1.5 });
    expect(p.confirmar).toBe(false);
    expect(pedidoSchema.safeParse({ representada_id: R1, cliente_id: R2, itens: [] }).success).toBe(false);
    expect(pedidoSchema.safeParse({ representada_id: R1, cliente_id: R2, itens: [{ produto_id: P, quantidade: 0 }] }).success).toBe(false);
  });
  it("produto aceita comissão 0–100 e a deixa opcional", () => {
    expect(produtoSchema.parse({ sku: "A", nome: "Prod A", preco: 600, comissao: "5" }).comissao).toBe(5);
    expect(produtoSchema.parse({ sku: "A", nome: "Prod A", preco: 600 }).comissao).toBeUndefined();
    expect(produtoSchema.safeParse({ sku: "A", nome: "Prod A", preco: 600, comissao: 120 }).success).toBe(false);
  });
  it("status manual de comissão não aceita cancelada", () => {
    expect(marcarComissaoSchema.safeParse({ status: "cancelada" }).success).toBe(false);
    expect(marcarComissaoSchema.parse({ status: "recebida" }).status).toBe("recebida");
  });
});

describe("resumirComissoes", () => {
  const base = { percentual: 0, data_prevista: null, recebida_em: null, pedido: null };
  const c = (id: string, rep: string, nome: string, valor: number, status: Comissao["status"]): Comissao =>
    ({ ...base, id, representada_id: rep, representada: { id: rep, nome }, valor, status });

  it("critério da fase: A 600×5% + B 400×10% = 70 na representada", () => {
    const itens = [{ subtotal: 600, comissao: 5 }, { subtotal: 400, comissao: 10 }];
    const total = itens.reduce((s, i) => s + Math.round(i.subtotal * i.comissao) / 100, 0);
    expect(total).toBe(70);
    const [r] = resumirComissoes([c("1", R1, "Alfa", total, "a_receber")]);
    expect(r).toMatchObject({ representada: { nome: "Alfa" }, totais: { a_receber: 70, recebida: 0, atrasada: 0 } });
  });

  it("agrupa por representada e ignora canceladas", () => {
    const res = resumirComissoes([
      c("1", R2, "Beta", 10.1, "a_receber"),
      c("2", R2, "Beta", 20.2, "a_receber"),
      c("3", R2, "Beta", 5, "atrasada"),
      c("4", R1, "Alfa", 70, "recebida"),
      c("5", R1, "Alfa", 99, "cancelada"),
    ]);
    expect(res.map((r) => r.representada.nome)).toEqual(["Alfa", "Beta"]);
    expect(res[0]!.totais).toEqual({ a_receber: 0, recebida: 70, atrasada: 0 });
    expect(res[1]!.totais).toEqual({ a_receber: 30.3, recebida: 0, atrasada: 5 });
  });
});
