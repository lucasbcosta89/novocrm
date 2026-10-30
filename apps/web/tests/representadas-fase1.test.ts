import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  ConfiguracaoImportacao, ContextoValidacao, ProblemaImportacao, RegistroRepresentada, RelatorioImportacao,
  Representada, ResultadoValidacaoLinha, StatusRepresentada,
} from "@/lib/cadastros/tipos";
import { colunasRepresentada, representadaSchema } from "@/lib/validacao";

describe("representadas fase 1 — modelo e tipos", () => {
  it("contratos compilam e são importáveis por outros módulos", () => {
    const problema: ProblemaImportacao = { campo: "cnpj", mensagem: "CNPJ inválido", valor_recebido: "123" };
    const linha: ResultadoValidacaoLinha = { numero_linha: 2, classificacao: "invalida", dados: { cnpj: null }, erros: [problema], alertas: [] };
    const contexto: ContextoValidacao = { linhasAnteriores: [], valoresExistentesNaBase: new Map() };
    const config: ConfiguracaoImportacao<Representada> = {
      entidade: "representadas", colunasEsperadas: ["cnpj"], colunasObrigatorias: ["cnpj"], chaveDedupe: "cnpj", maxLinhas: 5000,
      validarLinha: () => linha, mensagens: {}, mensagemModelo: "",
    };
    const relatorio: RelatorioImportacao = {
      entidade: config.entidade, total_linhas: 1, validas: 0, com_alerta: 0, invalidas: 1, inseridas: 0, atualizadas: 0, ignoradas: 1,
      linhas: [config.validarLinha({ cnpj: "123" }, contexto)], arquivo_nome: "a.csv", iniciado_em: "", concluido_em: "",
    };
    expect(relatorio.linhas[0]?.erros[0]?.campo).toBe("cnpj");
    expectTypeOf<StatusRepresentada>().toEqualTypeOf<"ativa" | "inativa">();
    expectTypeOf<RegistroRepresentada>().not.toHaveProperty("clientes_vinculados");
    expectTypeOf<Representada["excluido_em"]>().toEqualTypeOf<string | null>();
  });

  it("formulário atual grava nas colunas renomeadas (telefone só com dígitos)", () => {
    const d = representadaSchema.parse({
      nome: "Alfa Calçados Ltda", cnpj: "11.222.333/0001-81", rua: "Rua A", municipio: "Goiânia", estado: "go",
      email: "Vendas@Alfa.com", telefone: "(62) 3333-4444",
    });
    expect(colunasRepresentada(d)).toMatchObject({
      razao_social: "Alfa Calçados Ltda", cnpj: "11222333000181", endereco: "Rua A", cidade: "Goiânia", uf: "GO",
      email_comercial: "vendas@alfa.com", telefone: "6233334444",
    });
    expect(colunasRepresentada({ telefone: "" as unknown as undefined })).not.toHaveProperty("razao_social");
  });

  it("razão social: 3 a 150 caracteres", () => {
    expect(representadaSchema.safeParse({ nome: "AB" }).success).toBe(false);
    expect(representadaSchema.safeParse({ nome: "A".repeat(151) }).success).toBe(false);
    expect(representadaSchema.safeParse({ nome: "ABC" }).success).toBe(true);
  });
});
