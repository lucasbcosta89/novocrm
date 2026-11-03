import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { COLUNAS_REPRESENTADA, importacaoRepresentadas as config } from "@/lib/cadastros/importacao-representadas";
import type { ConfiguracaoImportacao } from "@/lib/cadastros/tipos";
import { lerPlanilha, relatorioErrosCsv } from "@/lib/importacao/arquivos";
import { chaveImportacao, problemasCabecalho, resumirValidacao, validarPlanilha, type LinhaBruta } from "@/lib/importacao/motor";

const cab = [...COLUNAS_REPRESENTADA];
const linha = (n: number, v: Partial<Record<(typeof COLUNAS_REPRESENTADA)[number], string>>): LinhaBruta => ({
  numero_linha: n, valores: cab.map((c) => v[c] ?? ""),
});
const ok = { razao_social: "Alfa Ltda", cnpj: "11.222.333/0001-81", email_comercial: "a@a.com", cidade: "Goiânia", uf: "GO", comissao_percentual: "7,5" };

describe("representadas fase 4 — importação genérica", () => {
  it("modelo: cabeçalho exato na ordem da especificação", () => {
    expect(config.colunasEsperadas.join(" | ")).toBe(
      "codigo_representada | razao_social | nome_fantasia | cnpj | inscricao_estadual | email_comercial | telefone | contato_nome | contato_telefone | cep | endereco | numero | complemento | bairro | cidade | uf | comissao_percentual | prazo_pagamento_dias | tabela_preco | status | observacoes",
    );
    expect(Object.keys(config.linhaExemplo)).toEqual(config.colunasEsperadas);
  });

  it("cabeçalho divergente (renomeado) invalida todas as linhas e aparece no relatório; sem adivinhar", async () => {
    const renomeado = cab.map((c) => (c === "email_comercial" ? "email" : c));
    expect(problemasCabecalho(cab, renomeado)).toEqual([
      { campo: "email_comercial", mensagem: 'Cabeçalho fora do padrão: coluna 6 deveria ser "email_comercial", veio "email"', valor_recebido: "email" },
    ]);
    const r = await validarPlanilha(config, renomeado, [linha(2, ok), linha(3, { ...ok, cnpj: "45723174000110" })], new Map());
    expect(r.map((l) => l.classificacao)).toEqual(["invalida", "invalida"]);
    expect(r[0]!.erros[0]!.campo).toBe("email_comercial");
    expect(problemasCabecalho(cab, [...cab, "extra"])[0]!.mensagem).toContain('coluna 22 ("extra") não existe no modelo');
  });

  it("CNPJ repetido no arquivo: a duplicada é inválida; obrigatórios e formatos com mensagem por campo", async () => {
    const r = await validarPlanilha(config, cab, [
      linha(2, ok),
      linha(3, { ...ok, razao_social: "Outra Ltda", cnpj: "11222333000181" }),
      linha(4, { ...ok, cnpj: "45723174000110", email_comercial: "", uf: "XX", comissao_percentual: "150" }),
    ], new Map());
    expect(r.map((l) => [l.numero_linha, l.classificacao])).toEqual([[2, "valida"], [3, "invalida"], [4, "invalida"]]);
    expect(r[1]!.erros).toEqual([{ campo: "cnpj", mensagem: "CNPJ repetido no arquivo (já aparece em uma linha anterior)", valor_recebido: "11222333000181" }]);
    expect(r[2]!.erros.map((e) => [e.campo, e.mensagem])).toEqual([
      ["email_comercial", 'Campo obrigatório "email_comercial" está vazio'],
      ["uf", "UF inválida"],
      ["comissao_percentual", "Comissão deve estar entre 0 e 100"],
    ]);
    expect(resumirValidacao(r)).toEqual({ total_linhas: 3, validas: 1, com_alerta: 0, invalidas: 2 });
  });

  it("CNPJ já cadastrado vira alerta (atualização) e só os campos preenchidos vão para gravação", async () => {
    const base = new Map<string, unknown>([[chaveImportacao("cnpj", "11222333000181"), { codigo: "REP-0003" }]]);
    const [l] = await validarPlanilha(config, cab, [linha(2, { ...ok, telefone: "" })], base);
    expect(l!.classificacao).toBe("com_alerta");
    expect(l!.alertas[0]!.mensagem).toContain("REP-0003");
    expect(l!.dados).toEqual({ razao_social: "Alfa Ltda", cnpj: "11222333000181", email_comercial: "a@a.com", cidade: "Goiânia", uf: "GO", comissao_percentual: 7.5 });
    expect("telefone" in l!.dados).toBe(false);
    expect("status" in l!.dados).toBe(false);
  });

  it("código e inscrição estadual já usados por outra representada são inválidos", async () => {
    const base = new Map<string, unknown>([
      [chaveImportacao("codigo_representada", "REP-0001"), { cnpj: "45723174000110" }],
      [chaveImportacao("inscricao_estadual", "123456"), { cnpj: "45723174000110" }],
    ]);
    const [l] = await validarPlanilha(config, cab, [linha(2, { ...ok, codigo_representada: "rep-0001", inscricao_estadual: "123.456" })], base);
    expect(l!.erros.map((e) => e.campo)).toEqual(["inscricao_estadual", "codigo_representada"]);
  });

  it("lê .csv (; e Windows-1252) e .xlsx; CNPJ numérico do Excel recupera o zero à esquerda; acima de 5.000 linhas recusa", async () => {
    const csv = [cab.join(";"), cab.map((c) => ({ ...ok, cidade: "São Paulo", uf: "SP" } as Record<string, string>)[c] ?? "").join(";")].join("\r\n");
    const latin1 = Uint8Array.from([...csv].map((ch) => ch.charCodeAt(0)));
    const lidoCsv = await lerPlanilha(new File([latin1], "rep.csv"));
    expect(lidoCsv.cabecalho).toEqual(cab);
    expect(lidoCsv.linhas[0]!.valores[cab.indexOf("cidade")]).toBe("São Paulo");

    const ws = XLSX.utils.aoa_to_sheet([cab, cab.map((c) => (c === "cnpj" ? 1222333000128 : (ok as Record<string, string>)[c] ?? ""))]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "r");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const lidoXlsx = await lerPlanilha(new File([bytes], "rep.xlsx"));
    const [l] = await validarPlanilha(config, lidoXlsx.cabecalho, lidoXlsx.linhas, new Map());
    expect(l!.dados.cnpj).toBe("01222333000128");

    const grande = [cab.join(";"), ...Array.from({ length: 5001 }, (_, i) => `;Rep ${i};;x`)].join("\n");
    await expect(lerPlanilha(new File([grande], "g.csv"))).rejects.toThrow("A planilha tem 5.001 linhas; o limite é 5.000 por importação");
    await expect(lerPlanilha(new File(["x"], "a.pdf"))).rejects.toThrow("Envie um arquivo .xlsx ou .csv.");
  });

  it("relatório de erros em CSV: linha, campo e mensagem, com acentos", async () => {
    const r = await validarPlanilha(config, cab, [linha(5, { ...ok, uf: "XX" })], new Map());
    const csv = relatorioErrosCsv({ linhas: r });
    expect(csv.split("\r\n")).toEqual(["﻿Linha;Classificação;Tipo;Campo;Mensagem;Valor recebido", "5;Inválida;Erro;uf;UF inválida;XX"]);
  });

  it("o motor é genérico: outra configuração (ex.: clientes) funciona sem mudar o motor", async () => {
    const clientes: ConfiguracaoImportacao<{ documento: string }> = {
      entidade: "clientes", colunasEsperadas: ["nome", "documento"], colunasObrigatorias: ["nome"], chaveDedupe: "documento",
      maxLinhas: 10, mensagens: {}, mensagemModelo: "", linhaExemplo: { nome: "Exemplo", documento: "1" },
      validarLinha: (b, ctx) => ({
        numero_linha: 0, classificacao: "valida", dados: { nome: b.nome ?? null, documento: b.documento ?? null }, alertas: [],
        erros: ctx.linhasAnteriores.includes(`documento:${b.documento}`) ? [{ campo: "documento", mensagem: "repetido", valor_recebido: b.documento ?? null }] : [],
      }),
    };
    const r = await validarPlanilha(clientes, ["nome", "documento"], [
      { numero_linha: 2, valores: ["Ana", "1"] }, { numero_linha: 3, valores: ["Bia", "1"] }, { numero_linha: 4, valores: ["", "2"] },
    ], new Map());
    expect(r.map((l) => l.classificacao)).toEqual(["valida", "invalida", "invalida"]);
    expect(r[2]!.erros[0]!.mensagem).toBe('Campo obrigatório "nome" vazio');
  });
});
