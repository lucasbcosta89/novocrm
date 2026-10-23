import { describe, expect, it } from "vitest";
import { CAMPOS_MODELO, CAMPOS_OBRIGATORIOS, ROTULOS, normalizarCabecalho, validarCabecalho } from "@/lib/import/validarCabecalho";
import { parseNcm, parseNumero, parsePercentual } from "@/lib/import/valores";

describe("importação: cabeçalho", () => {
  it("modelo, rótulos e obrigatórios", () => {
    expect(CAMPOS_MODELO).toEqual(["sku", "nome", "unidade", "ncm", "categoria", "preco_padrao", "desconto_maximo", "comissao", "descricao"]);
    expect(CAMPOS_MODELO.map((c) => ROTULOS[c])).toEqual(["SKU", "Nome", "Unidade", "NCM", "Categoria", "Preço Padrão", "Desconto Máximo", "Comissão", "Descrição"]);
    expect(CAMPOS_OBRIGATORIOS).toEqual(["sku", "nome", "unidade", "ncm"]);
  });

  it("normaliza acento, caixa, pontuação e espaços", () => {
    expect(normalizarCabecalho("  Preço   Padrão (R$) ")).toBe("preco padrao r");
    expect(normalizarCabecalho("DESCONTO_MÁXIMO")).toBe("desconto maximo");
    expect(normalizarCabecalho(null)).toBe("");
    expect(normalizarCabecalho(123)).toBe("123");
  });

  it("casa por igualdade exata após normalizar e lista faltando/extras", () => {
    const r = validarCabecalho(["sku", "NOME", "Unidade ", "ncm", "preço padrão", "COMISSAO", "Fornecedor", "", "Nome"]);
    expect(r.indices).toEqual({ sku: 0, nome: 1, unidade: 2, ncm: 3, preco_padrao: 4, comissao: 5 });
    expect(r.faltando).toEqual([]);
    expect(r.extras).toEqual(["Fornecedor", "Nome"]);
    const s = validarCabecalho(["Codigo SKU", "Nome do produto", "Unid."]);
    expect(s.indices).toEqual({});
    expect(s.faltando).toEqual(["sku", "nome", "unidade", "ncm"]);
    expect(s.extras).toEqual(["Codigo SKU", "Nome do produto", "Unid."]);
  });
});

describe("importação: valores", () => {
  it("parseNumero: o último separador é o decimal", () => {
    expect(parseNumero("R$ 1.234,56")).toBe(1234.56);
    expect(parseNumero("1.234,56")).toBe(1234.56);
    expect(parseNumero("1234.56")).toBe(1234.56);
    expect(parseNumero("1,234.56")).toBe(1234.56);
    expect(parseNumero("10")).toBe(10);
    expect(parseNumero(" -12,5 ")).toBe(-12.5);
    expect(parseNumero(99.9)).toBe(99.9);
    expect(parseNumero("")).toBeNull();
    expect(parseNumero(null)).toBeNull();
    expect(parseNumero("abc")).toBeNull();
  });

  it("parsePercentual: remove % e converte fração", () => {
    expect(parsePercentual("10%")).toBe(10);
    expect(parsePercentual("12,5 %")).toBe(12.5);
    expect(parsePercentual(0.1)).toBe(10);
    expect(parsePercentual("0,05")).toBe(5);
    expect(parsePercentual("0,5%")).toBe(0.5);
    expect(parsePercentual(1)).toBe(1);
    expect(parsePercentual("")).toBeNull();
  });

  it("parseNcm: só 8 dígitos", () => {
    expect(parseNcm("6109.10.00")).toBe("61091000");
    expect(parseNcm(61091000)).toBe("61091000");
    expect(parseNcm("6109.10")).toBeNull();
    expect(parseNcm("610910001")).toBeNull();
    expect(parseNcm(null)).toBeNull();
  });
});

describe("importação: Server Action (preview)", () => {
  const REP = "11111111-1111-4111-8111-111111111111";
  const supabaseFalso = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: REP }, error: null }) }) }) }),
  };

  it("valida linhas com o número real da planilha, mensagens distintas de NCM e SKU repetido; não grava", async () => {
    const { vi } = await import("vitest");
    vi.doMock("server-only", () => ({}));
    vi.doMock("next/cache", () => ({ revalidatePath: () => {} }));
    vi.doMock("@/server/contexto", () => ({ obterContexto: async () => ({ supabase: supabaseFalso, userId: "u1" }) }));
    const { importarProdutos } = await import("@/app/app/representadas/[id]/catalogo/_actions/importarProdutos");
    const r = await importarProdutos({
      representada_id: REP, arquivo: "produtos.xlsx", modo: "preview",
      linhas: [
        { sku: "A1", nome: "Camiseta", unidade: "pc", ncm: "6109.10.00", preco_padrao: "R$ 1.234,56", desconto_maximo: "10%", comissao: 0.05 },
        { sku: "A2", nome: "Boné", ncm: "" },
        { sku: "A3", nome: "Meia", ncm: "6115.95" },
        { sku: "A1", nome: "Duplicada", ncm: "61091000" },
        { sku: "", nome: "X", ncm: "61091000", preco_padrao: "abc", comissao: "150" },
        { sku: "A5", nome: "Calça", ncm: "62034200", preco_padrao: "" },
      ],
    });
    expect(r.modo).toBe("preview");
    if (r.modo !== "preview") return;
    expect(r.total).toBe(6);
    expect(r.validas).toBe(2);
    expect(r.amostra[0]).toEqual({ sku: "A1", nome: "Camiseta", unidade: "PC", ncm: "61091000", categoria: null, preco_padrao: 1234.56, desconto_maximo: 10, comissao: 5, descricao: null });
    expect(r.amostra[1]).toMatchObject({ sku: "A5", unidade: "UN", preco_padrao: null, desconto_maximo: 0, comissao: 0 });
    expect(r.erros).toContainEqual({ linha: 3, campo: "ncm", mensagem: "Informe o NCM" });
    expect(r.erros).toContainEqual({ linha: 4, campo: "ncm", mensagem: "NCM deve ter exatamente 8 dígitos" });
    expect(r.erros).toContainEqual({ linha: 5, campo: "sku", mensagem: 'SKU "A1" repetido no arquivo (já aparece na linha 2)' });
    expect(r.erros.filter((e) => e.linha === 6).map((e) => e.campo).sort()).toEqual(["comissao", "nome", "preco_padrao", "sku"]);
    await expect(importarProdutos({ representada_id: REP, arquivo: "x.csv", modo: "apagar", linhas: [{}] })).rejects.toThrow();
    await expect(importarProdutos({ representada_id: REP, arquivo: "x.csv", modo: "preview", linhas: [] })).rejects.toThrow();
  });
});
