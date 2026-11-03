import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  ConfiguracaoImportacao, ContextoValidacao, ProblemaImportacao, RegistroRepresentada, RelatorioImportacao,
  Representada, ResultadoValidacaoLinha, StatusRepresentada,
} from "@/lib/cadastros/tipos";

describe("representadas fase 1 — modelo e tipos", () => {
  it("contratos compilam e são importáveis por outros módulos", () => {
    const problema: ProblemaImportacao = { campo: "cnpj", mensagem: "CNPJ inválido", valor_recebido: "123" };
    const linha: ResultadoValidacaoLinha = { numero_linha: 2, classificacao: "invalida", dados: { cnpj: null }, erros: [problema], alertas: [] };
    const contexto: ContextoValidacao = { linhasAnteriores: [], valoresExistentesNaBase: new Map() };
    const config: ConfiguracaoImportacao<Representada> = {
      entidade: "representadas", colunasEsperadas: ["cnpj"], colunasObrigatorias: ["cnpj"], chaveDedupe: "cnpj", maxLinhas: 5000,
      validarLinha: () => linha, mensagens: {}, mensagemModelo: "", linhaExemplo: {},
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
});
