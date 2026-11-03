import { describe, expect, it } from "vitest";
import {
  campoDoErroRepresentada, representadaFormSchema, representadaParcialSchema, validarCampoRepresentada, validarRepresentada,
  valoresDaRepresentada, VALORES_VAZIOS_REPRESENTADA,
} from "@/lib/cadastros/representada";
import { normalizarInscricaoEstadual, normalizarTelefone } from "@/lib/cadastros/normalizadores";

const valida = {
  razao_social: "Calçados Alfa Ltda", cnpj: "11.222.333/0001-81", email_comercial: "Vendas@Alfa.com.br",
  cidade: "Goiânia", uf: "go", comissao_percentual: "7,5",
};

describe("representadas fase 3 — formulário", () => {
  it("validação por campo (ao sair do campo) com mensagem em português", () => {
    expect(validarCampoRepresentada("razao_social", "")).toBe("Informe a razão social");
    expect(validarCampoRepresentada("razao_social", "AB")).toBe("Razão social deve ter de 3 a 150 caracteres");
    expect(validarCampoRepresentada("cnpj", "")).toBe("Informe o CNPJ");
    expect(validarCampoRepresentada("cnpj", "11.222.333/0001-82")).toBe("CNPJ inválido (dígito verificador não confere)");
    expect(validarCampoRepresentada("cnpj", "11.222.333/0001-81")).toBeNull();
    expect(validarCampoRepresentada("email_comercial", "vendas@")).toBe("E-mail inválido");
    expect(validarCampoRepresentada("uf", "XX")).toBe("UF inválida");
    expect(validarCampoRepresentada("comissao_percentual", "")).toBeNull(); // comissão fixa (se houver): opcional
    expect(validarCampoRepresentada("comissao_percentual", "101")).toBe("Comissão fixa deve estar entre 0 e 100");
    expect(validarCampoRepresentada("comissao_percentual", "7,555")).toBe("Comissão fixa: no máximo 2 casas decimais");
    expect(validarCampoRepresentada("prazo_pagamento_dias", "400")).toBe("Prazo entre 0 e 365 dias");
    expect(validarCampoRepresentada("observacoes", "x".repeat(501))).toBe("Observações: máximo de 500 caracteres");
  });

  it("CNPJ inválido é erro impeditivo (o salvar fica desabilitado)", () => {
    expect(validarRepresentada({ ...valida, cnpj: "11.222.333/0001-82" })).toEqual({ cnpj: "CNPJ inválido (dígito verificador não confere)" });
    expect(validarRepresentada(valida)).toEqual({});
    expect(Object.keys(validarRepresentada(VALORES_VAZIOS_REPRESENTADA)).sort()).toEqual(
      ["cidade", "cnpj", "email_comercial", "razao_social", "uf"],
    );
  });

  it("normaliza para gravar: CNPJ sem máscara, e-mail minúsculo, UF maiúscula, decimal com vírgula, vazios null", () => {
    expect(representadaFormSchema.parse({ ...valida, nome_fantasia: " ", telefone: "+55 (62) 3333-4444", inscricao_estadual: "isento" })).toMatchObject({
      cnpj: "11222333000181", email_comercial: "vendas@alfa.com.br", uf: "GO", comissao_percentual: 7.5,
      nome_fantasia: null, telefone: "6233334444", inscricao_estadual: "ISENTO", status: "ativa", codigo_representada: null,
    });
    expect(normalizarTelefone("(62) 99999-8888")).toBe("62999998888");
    expect(normalizarInscricaoEstadual("10.123.456-7")).toBe("101234567");
  });

  it("status Inativa é aceito (inativar mantém o registro)", () => {
    expect(representadaFormSchema.parse({ ...valida, status: "Inativa" }).status).toBe("inativa");
  });

  it("PATCH da API altera só os campos enviados", () => {
    expect(representadaParcialSchema.parse({ cidade: "Anápolis" })).toEqual({ cidade: "Anápolis" });
  });

  it("erros do banco voltam para baixo do campo certo", () => {
    expect(campoDoErroRepresentada('duplicate key value violates unique constraint "representadas_user_cnpj_key"'))
      .toEqual({ campo: "cnpj", mensagem: "Já existe uma representada com este CNPJ" });
    expect(campoDoErroRepresentada("Informe o e-mail comercial")).toEqual({ campo: "email_comercial", mensagem: "Informe o e-mail comercial" });
    expect(campoDoErroRepresentada("Limite do plano atingido")).toBeNull();
  });

  it("edição carrega o registro (comissão com vírgula)", () => {
    expect(valoresDaRepresentada({ razao_social: "Alfa", comissao_percentual: "7.50", cnpj: null })).toMatchObject({
      razao_social: "Alfa", comissao_percentual: "7,5", cnpj: "", status: "ativa",
    });
  });
});
