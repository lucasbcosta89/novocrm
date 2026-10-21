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

describe("funis (fase 4d-1)", () => {
  it("valida nome/modelo e define as etapas de cada modelo", async () => {
    const { funilSchema } = await import("@/lib/validacao");
    const { ETAPAS_MODELO, ROTULO_MODELO_FUNIL, emAberto } = await import("@/lib/funis");
    expect(funilSchema.parse({ nome: "  Vendas 2027 ", modelo: "prospeccao" })).toEqual({ nome: "Vendas 2027", modelo: "prospeccao" });
    expect(funilSchema.safeParse({ nome: " ", modelo: "vendas" }).success).toBe(false);
    expect(funilSchema.safeParse({ nome: "X", modelo: "outro" }).success).toBe(false);
    expect(ETAPAS_MODELO.vendas).toEqual(["Oportunidade Identificada", "Proposta Enviada", "Negociação", "Fechamento"]);
    expect(ETAPAS_MODELO.prospeccao).toHaveLength(6);
    expect(ETAPAS_MODELO.personalizado).toEqual(Array(4).fill("Definir Etapa"));
    expect(ROTULO_MODELO_FUNIL.vendas).toBe("Modelo Padrão - Vendas");
    expect(emAberto({ arquivada: false, status: "em_progresso" })).toBe(true);
    expect(emAberto({ arquivada: true, status: "em_progresso" })).toBe(false);
    expect(emAberto({ arquivada: false, status: "concluido" })).toBe(false);
  });
});

describe("kanban do funil (fase 4d-2)", () => {
  it("valida nome de etapa e aceita etapa no movimento e na conclusão", async () => {
    const { etapaSchema, oportunidadeUpdateSchema, resultadoSchema, novaOportunidadeSchema } = await import("@/lib/validacao");
    expect(etapaSchema.parse({ nome: "  Visita técnica " })).toEqual({ nome: "Visita técnica" });
    expect(etapaSchema.safeParse({ nome: "" }).success).toBe(false);
    expect(etapaSchema.safeParse({ nome: "x".repeat(61) }).success).toBe(false);
    expect(oportunidadeUpdateSchema.parse({ etapa_id: P })).toEqual({ etapa_id: P });
    expect(oportunidadeUpdateSchema.safeParse({ etapa_id: "x" }).success).toBe(false);
    expect(resultadoSchema.parse({ resultado: "perdeu", observacoes_resultado: "Preço", etapa_id: P })).toEqual({ resultado: "perdeu", observacoes_resultado: "Preço", etapa_id: P });
    expect(novaOportunidadeSchema.parse({ titulo: "Op", representada_id: R1, funil_id: R2 }).funil_id).toBe(R2);
  });
});

describe("alertas dos cards (fase 4d-3)", () => {
  it("vermelho com tarefa vencida, amarelo vencendo em até 7 dias, verde em dia, sem faixa sem tarefas", async () => {
    const { alertaTarefas } = await import("@/lib/oportunidades");
    const hoje = "2026-10-21";
    const v = alertaTarefas([{ status: "nao_iniciado", descricao: "Ligar", prazo: "2026-10-18" }, { status: "concluido", descricao: "X", prazo: "2026-10-01" }], hoje);
    expect(v).toEqual({ nivel: "vermelho", mensagem: 'Tarefa "Ligar" vencida em 18/10' });
    expect(alertaTarefas([{ status: "em_progresso", descricao: "Visita", prazo: "2026-10-26" }], hoje)?.nivel).toBe("amarelo");
    expect(alertaTarefas([{ status: "em_progresso", descricao: "Visita", prazo: "2026-10-28" }], hoje)?.nivel).toBe("amarelo");
    expect(alertaTarefas([{ status: "em_progresso", descricao: "Visita", prazo: "2026-10-29" }], hoje)?.nivel).toBe("verde");
    expect(alertaTarefas([{ status: "concluido", descricao: "Ok", prazo: "2026-10-01" }, { status: "nao_iniciado", descricao: "Sem prazo", prazo: null }], hoje)?.nivel).toBe("verde");
    expect(alertaTarefas([], hoje)).toBeNull();
  });
});
