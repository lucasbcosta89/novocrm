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
