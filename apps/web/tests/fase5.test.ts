import { describe, expect, it } from "vitest";
import { marcarComissaoSchema, pedidoSchema, produtoSchema } from "@/lib/validacao";
import { resumirComissoes, type Comissao } from "@/server/comissoes";

const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";

describe("pedidoSchema", () => {
  it("converte quantidades/desconto e exige itens", () => {
    const p = pedidoSchema.parse({ representada_id: R1, cliente_id: R2, itens: [{ produto_id: P, quantidade: "2", desconto_percentual: "1,5" }] });
    expect(p.itens[0]).toEqual({ produto_id: P, quantidade: 2, desconto_percentual: 1.5 });
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

describe("NCM do produto (Fase 3d-2)", () => {
  it("opcional; 8 dígitos quando preenchido", () => {
    expect(produtoSchema.parse({ sku: "A", nome: "Prod A", preco: 10, ncm: "4820.10.00" }).ncm).toBe("48201000");
    expect(produtoSchema.parse({ sku: "A", nome: "Prod A", preco: 10, ncm: "" }).ncm).toBeNull();
    expect(produtoSchema.safeParse({ sku: "A", nome: "Prod A", preco: 10, ncm: "1234" }).success).toBe(false);
  });
});

describe("Fase 3d-3: desconto %, pagamento e prazo", () => {
  it("10% sobre item de R$ 100 = R$ 90", async () => {
    const { subtotalItem } = await import("@/lib/validacao");
    expect(subtotalItem(1, 100, 10)).toBe(90);
    expect(subtotalItem(3, 33.33, 5)).toBe(94.99);
  });
  it("forma de pagamento e prazo", () => {
    const base = { representada_id: R1, cliente_id: R2, itens: [{ produto_id: P, quantidade: 1, desconto_percentual: 10 }] };
    expect(pedidoSchema.parse({ ...base, forma_pagamento: "pix" })).toMatchObject({ forma_pagamento: "pix", prazo_tipo: "a_vista", prazo_dias: null });
    expect(pedidoSchema.parse({ ...base, prazo_tipo: "a_prazo", prazo_dias: "30" }).prazo_dias).toBe(30);
    expect(pedidoSchema.parse({ ...base, prazo_tipo: "a_vista", prazo_dias: "30" }).prazo_dias).toBeNull();
    expect(pedidoSchema.safeParse({ ...base, prazo_tipo: "a_prazo" }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...base, forma_pagamento: "boleto" }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...base, itens: [{ produto_id: P, quantidade: 1, desconto_percentual: 101 }] }).success).toBe(false);
  });
  it("tabela de preços editável valida preço e desconto máximo", async () => {
    const { precosSchema } = await import("@/lib/validacao");
    expect(precosSchema.parse([{ id: P, preco: "12,50", desconto_max: "10" }])).toEqual([{ id: P, preco: 12.5, desconto_max: 10 }]);
    expect(precosSchema.safeParse([{ id: P, preco: -1, desconto_max: 0 }]).success).toBe(false);
    expect(precosSchema.safeParse([]).success).toBe(false);
  });
});

describe("edição de pedido", () => {
  it("aceita preço informado, desconto em % e prazo; rejeita lista vazia e preço negativo", async () => {
    const { edicaoPedidoSchema } = await import("@/lib/validacao");
    const e = edicaoPedidoSchema.parse({ prazo_tipo: "a_prazo", prazo_dias: "30", itens: [{ produto_id: P, quantidade: "2", preco_unitario: "80,00", desconto_percentual: "10" }] });
    expect(e.itens[0]).toEqual({ produto_id: P, quantidade: 2, preco_unitario: 80, desconto_percentual: 10 });
    expect(e.prazo_dias).toBe(30);
    expect(edicaoPedidoSchema.parse({ prazo_tipo: "a_vista", prazo_dias: "30", itens: [{ produto_id: P, quantidade: 1, preco_unitario: 5 }] }).prazo_dias).toBeNull();
    expect(edicaoPedidoSchema.safeParse({ itens: [] }).success).toBe(false);
    expect(edicaoPedidoSchema.safeParse({ itens: [{ produto_id: P, quantidade: 1, preco_unitario: -1 }] }).success).toBe(false);
    expect(edicaoPedidoSchema.safeParse({ prazo_tipo: "a_prazo", itens: [{ produto_id: P, quantidade: 1, preco_unitario: 1 }] }).success).toBe(false);
  });
});
