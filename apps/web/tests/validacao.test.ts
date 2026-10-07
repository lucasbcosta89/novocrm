import { describe, expect, it } from "vitest";
import { clienteSchema, produtoSchema, representadaSchema, slugify, vinculoSchema } from "@/lib/validacao";

describe("slugify", () => {
  it("remove acentos e símbolos", () => {
    expect(slugify("Indústria São João & Cia.")).toBe("industria-sao-joao-cia");
  });
  it("nunca vazio", () => {
    expect(slugify("***")).toBe("representada");
  });
});

describe("representadaSchema", () => {
  it("normaliza CNPJ e converte comissão", () => {
    const r = representadaSchema.parse({ nome: "Alfa", cnpj: "12.345.678/0001-90", comissao_padrao: "5,5" });
    expect(r).toEqual({ nome: "Alfa", cnpj: "12345678000190", comissao_padrao: 5.5 });
  });
  it("campo vazio vira null; rejeita CNPJ curto e comissão > 100", () => {
    expect(representadaSchema.parse({ nome: "Alfa", cnpj: "" }).cnpj).toBeNull();
    expect(representadaSchema.safeParse({ nome: "Alfa", cnpj: "123" }).success).toBe(false);
    expect(representadaSchema.safeParse({ nome: "Alfa", comissao_padrao: 101 }).success).toBe(false);
  });
});

describe("clienteSchema", () => {
  it("aceita CPF ou CNPJ e normaliza UF/e-mail", () => {
    const c = clienteSchema.parse({ nome: "Loja X", documento: "123.456.789-09", uf: "sp", email: "A@B.COM", cep: "01001-000" });
    expect(c).toMatchObject({ documento: "12345678909", uf: "SP", email: "a@b.com", cep: "01001000" });
  });
  it("rejeita documento inválido", () => {
    expect(clienteSchema.safeParse({ nome: "Loja X", documento: "123" }).success).toBe(false);
  });
});

describe("produto e vínculo", () => {
  it("produto exige SKU e preço válido", () => {
    expect(produtoSchema.parse({ sku: "A1", nome: "Caneta", preco: "10,90" })).toMatchObject({ preco: 10.9, ativo: true, desconto_max: 0 });
    expect(produtoSchema.safeParse({ sku: "", nome: "Caneta", preco: "1" }).success).toBe(false);
    expect(produtoSchema.safeParse({ sku: "A1", nome: "Caneta", preco: "-1" }).success).toBe(false);
  });
  it("vínculo aceita só UUIDs", () => {
    expect(vinculoSchema.safeParse({ representada_ids: ["x"] }).success).toBe(false);
    expect(vinculoSchema.safeParse({ representada_ids: [] }).success).toBe(true);
  });
});

