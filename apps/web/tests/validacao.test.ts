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
  it("normaliza CNPJ, CEP, UF e e-mail (sem comissão: Fase 3d-1)", () => {
    const r = representadaSchema.parse({ nome: "Alfa", cnpj: "12.345.678/0001-90", cep: "74000-000", estado: "go", email: "A@B.COM", numero: "" });
    expect(r).toMatchObject({ nome: "Alfa", cnpj: "12345678000190", cep: "74000000", estado: "GO", email: "a@b.com", numero: null });
  });
  it("campo vazio vira null; rejeita CNPJ curto, UF e CEP inválidos", () => {
    expect(representadaSchema.parse({ nome: "Alfa", cnpj: "" }).cnpj).toBeNull();
    expect(representadaSchema.safeParse({ nome: "Alfa", cnpj: "123" }).success).toBe(false);
    expect(representadaSchema.safeParse({ nome: "Alfa", estado: "XX" }).success).toBe(false);
    expect(representadaSchema.safeParse({ nome: "Alfa", cep: "123" }).success).toBe(false);
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


describe("ponto de faturamento (Fase 3d-1)", () => {
  it("mesmos campos da representada + status", async () => {
    const { pontoFaturamentoSchema, pontoFaturamentoUpdateSchema } = await import("@/lib/validacao");
    expect(pontoFaturamentoSchema.parse({ nome: "Filial GO", estado: "GO" })).toMatchObject({ nome: "Filial GO", estado: "GO", status: "ativo" });
    expect(pontoFaturamentoSchema.safeParse({ nome: "X" }).success).toBe(false);
    expect(pontoFaturamentoUpdateSchema.parse({ status: "inativo" })).toEqual({ status: "inativo" });
  });
});
