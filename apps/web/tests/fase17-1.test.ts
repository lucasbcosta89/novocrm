import { describe, expect, it } from "vitest";
import { DESCONTO_MAX_PADRAO, resolverDescontoMaximo } from "@/lib/desconto";
import { edicaoPedidoSchema, itemSemProdutoSchema, pedidoSchema } from "@/lib/validacao";
import { agruparPedidos, importacaoPedidos as config, type ProdutoExistente } from "@/lib/cadastros/importacao-pedidos";
import { chaveImportacao, validarPlanilha } from "@/lib/importacao/motor";

const REP = "00000000-0000-4000-8000-000000000001";
const CLI = "00000000-0000-4000-8000-000000000002";
const PROD = "00000000-0000-4000-8000-000000000003";

describe("fase 17.1 — desconto máximo em cascata (F)", () => {
  it("produto > 0 → representada > 0 → padrão da conta → 10", () => {
    expect(resolverDescontoMaximo({ desconto_max: 7 }, { desconto_max: 12 }, { desconto_max_padrao: 20 })).toBe(7);
    expect(resolverDescontoMaximo({ desconto_max: 0 }, { desconto_max: 12 }, { desconto_max_padrao: 20 })).toBe(12);
    expect(resolverDescontoMaximo({ desconto_max: null }, { desconto_max: 0 }, { desconto_max_padrao: 20 })).toBe(20);
    expect(resolverDescontoMaximo(null, null, null)).toBe(DESCONTO_MAX_PADRAO);
    expect(DESCONTO_MAX_PADRAO).toBe(10);
  });
  it("item sem produto (representada sem comissão nem desconto) ainda tem checagem: usa o padrão", () => {
    expect(resolverDescontoMaximo(null, { desconto_max: null }, { desconto_max_padrao: 10 })).toBe(10);
    expect(resolverDescontoMaximo(undefined, { desconto_max: 15 }, { desconto_max_padrao: 10 })).toBe(15);
  });
});

describe("fase 17.1 — item sem produto no formulário manual (C.3)", () => {
  const base = { produto_id: null, quantidade: "2", preco_unitario: "50" };
  it("exige 'Descrição do item' (até 200); SKU opcional (até 60)", () => {
    expect(itemSemProdutoSchema.safeParse({ ...base, descricao_informada: "  " }).success).toBe(false);
    expect(itemSemProdutoSchema.safeParse({ ...base, descricao_informada: "x".repeat(201) }).success).toBe(false);
    expect(itemSemProdutoSchema.safeParse({ ...base, descricao_informada: "Caderno", sku_informado: "y".repeat(61) }).success).toBe(false);
    const ok = itemSemProdutoSchema.parse({ ...base, descricao_informada: " Caderno ", sku_informado: "" });
    expect([ok.descricao_informada, ok.sku_informado, ok.quantidade, ok.preco_unitario]).toEqual(["Caderno", null, 2, 50]);
  });
  it("pedido aceita itens com e sem produto juntos (sem bloquear a emissão)", () => {
    const p = pedidoSchema.parse({
      representada_id: REP, cliente_id: CLI, confirmar: true,
      itens: [{ produto_id: PROD, quantidade: "1" }, { ...base, descricao_informada: "Avulso", sku_informado: "AV-1" }],
    });
    expect(p.itens).toHaveLength(2);
    expect(p.itens[1]).toMatchObject({ produto_id: null, descricao_informada: "Avulso", sku_informado: "AV-1" });
  });
  it("edição preserva o item sem produto pelo item_id", () => {
    const e = edicaoPedidoSchema.parse({ itens: [{ ...base, item_id: PROD, descricao_informada: "Avulso" }] });
    expect(e.itens[0]).toMatchObject({ produto_id: null, item_id: PROD });
  });
});

describe("fase 17.1 — importação grava a linha da planilha no item sem produto (C.2/C.6)", () => {
  it("item com SKU fora do Catálogo leva sku, descrição e linha", async () => {
    const prod: ProdutoExistente = { produto_id: "p-1", representada_id: REP, representada: "Alfa", nome: "Produto 1", preco: 10 };
    const existentes = new Map<string, unknown>([[chaveImportacao("cliente", "11222333000181"), { id: CLI, nome: "Loja" }], [chaveImportacao("sku", "S1"), [prod]]]);
    const cab = config.colunasEsperadas;
    const linha = (n: number, sku: string) => ({
      numero_linha: n,
      valores: cab.map((c) => ({ "Número do Pedido": "77", "Data do Pedido": "20/10/2026", "CNPJ/CPF do Cliente": "11222333000181", "SKU do Produto": sku, "Descrição do Produto": "Novo item", "Quantidade": "1", "Preço Unitário": "10", "Comissão (R$)": "1" } as Record<string, string>)[c] ?? ""),
    });
    const linhas = await validarPlanilha(config, cab, [linha(2, "S1"), linha(3, "NAO-EXISTE")], existentes);
    const [g] = agruparPedidos(linhas.map((l) => ({ ...l, erros: [], alertas: [] })), existentes);
    expect(g!.itens[1]).toMatchObject({ produto_id: null, sku: "NAO-EXISTE", pendencia: "produto_nao_cadastrado", linha: 3 });
  });
});
