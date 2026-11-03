import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { COLUNAS_CLIENTE, importacaoClientes as config } from "@/lib/cadastros/importacao-clientes";
import { lerPlanilha, linhasComErroCsv, relatorioErrosCsv } from "@/lib/importacao/arquivos";
import { chaveImportacao, problemasCabecalho, separarParaGravacao, validarPlanilha, type LinhaBruta } from "@/lib/importacao/motor";
import { IMPORTACOES } from "@/lib/importacao/registro";
import { clienteSchema } from "@/lib/validacao";

const cab = Object.keys(COLUNAS_CLIENTE);
type Col = keyof typeof COLUNAS_CLIENTE;
const linha = (n: number, v: Partial<Record<Col, string>>): LinhaBruta => ({ numero_linha: n, valores: cab.map((c) => v[c as Col] ?? "") });
const CNPJ = "11.222.333/0001-81";
const CPF = "123.456.789-09";

describe("fase 16 — clientes: CNPJ/CPF obrigatório", () => {
  it("cadastro (formulário, sync, catálogo) exige CNPJ/CPF válido com mensagens distintas para CPF e CNPJ", () => {
    const erro = (documento: string) => clienteSchema.safeParse({ nome: "Loja X", documento }).error?.issues[0]?.message;
    expect(erro("")).toBe("Informe o CNPJ ou CPF");
    expect(erro("123.456.789-00")).toBe("CPF inválido: dígitos verificadores não conferem");
    expect(erro("11.222.333/0001-82")).toBe("CNPJ inválido: dígitos verificadores não conferem");
    expect(erro("12345")).toBe("CNPJ/CPF deve ter 14 dígitos (CNPJ) ou 11 dígitos (CPF)");
    expect(clienteSchema.parse({ nome: "Loja X", documento: CPF }).documento).toBe("12345678909");
    expect(clienteSchema.parse({ nome: "Loja X", documento: CNPJ }).documento).toBe("11222333000181");
  });
});

describe("fase 16 — importação de clientes (mesma base das representadas)", () => {
  it("está registrada no motor genérico; modelo com cabeçalho exato e linha de exemplo", () => {
    expect(IMPORTACOES.clientes).toBe(config);
    expect(config.colunasEsperadas).toEqual(["nome", "cnpj_cpf", "email", "celular", "whatsapp", "cidade", "uf", "cep", "segmento", "anotacoes"]);
    expect(config.colunasObrigatorias).toEqual(["nome", "cnpj_cpf"]);
    expect(Object.keys(config.linhaExemplo)).toEqual(config.colunasEsperadas);
    expect(config.mensagens.notaModelo).toContain("vincule cada cliente às representadas dentro da plataforma");
    expect(config.colunasEsperadas).not.toContain("representada");
  });

  it("cabeçalho é contrato: coluna renomeada invalida as linhas e aparece no relatório", async () => {
    const renomeado = cab.map((c) => (c === "cnpj_cpf" ? "documento" : c));
    expect(problemasCabecalho(cab, renomeado)[0]!.mensagem).toBe('Cabeçalho fora do padrão: coluna 2 deveria ser "cnpj_cpf", veio "documento"');
    const r = await validarPlanilha(config, renomeado, [linha(2, { nome: "A", cnpj_cpf: CNPJ })], new Map());
    expect(r[0]!.classificacao).toBe("invalida");
  });

  it("CNPJ/CPF obrigatório e validado; repetido no arquivo é inválido; demais campos com as regras do cadastro", async () => {
    const r = await validarPlanilha(config, cab, [
      linha(2, { nome: "Loja PJ", cnpj_cpf: CNPJ, uf: "go" }),
      linha(3, { nome: "Pessoa PF", cnpj_cpf: CPF }),
      linha(4, { nome: "Sem documento" }),
      linha(5, { nome: "CPF ruim", cnpj_cpf: "123.456.789-00" }),
      linha(6, { nome: "CNPJ ruim", cnpj_cpf: "11.222.333/0001-82" }),
      linha(7, { nome: "Repetido", cnpj_cpf: "11222333000181" }),
      linha(8, { nome: "Outros erros", cnpj_cpf: "45.723.174/0001-10", email: "x@", uf: "XX", cep: "123" }),
    ], new Map());
    expect(r.map((l) => [l.numero_linha, l.classificacao])).toEqual([[2, "valida"], [3, "valida"], [4, "invalida"], [5, "invalida"], [6, "invalida"], [7, "invalida"], [8, "invalida"]]);
    expect(r[0]!.dados).toEqual({ nome: "Loja PJ", documento: "11222333000181", uf: "GO" });
    expect(r[2]!.erros).toEqual([{ campo: "cnpj_cpf", mensagem: 'Campo obrigatório "cnpj_cpf" está vazio', valor_recebido: null }]);
    expect(r[3]!.erros[0]!.mensagem).toBe("CPF inválido: dígitos verificadores não conferem");
    expect(r[4]!.erros[0]!.mensagem).toBe("CNPJ inválido: dígitos verificadores não conferem");
    expect(r[5]!.erros[0]!.mensagem).toBe("CNPJ/CPF repetido no arquivo (já aparece em uma linha anterior)");
    expect(r[6]!.erros.map((e) => e.campo)).toEqual(["email", "uf", "cep"]);
    expect(relatorioErrosCsv({ linhas: r }).split("\r\n")[1]).toBe('4;Inválida;Erro;cnpj_cpf;"Campo obrigatório ""cnpj_cpf"" está vazio";');
  });

  it("CNPJ/CPF já cadastrado atualiza só o preenchido; igual ao cadastro é ignorado (reenvio sem duplicar)", async () => {
    const base = new Map<string, unknown>([[chaveImportacao("documento", "11222333000181"), { nome: "Loja PJ", valores: { nome: "Loja PJ", documento: "11222333000181", cidade: "Goiânia" } }]]);
    const r = await validarPlanilha(config, cab, [
      linha(2, { nome: "Loja PJ", cnpj_cpf: CNPJ }),
      linha(3, { nome: "Pessoa PF", cnpj_cpf: CPF }),
    ], base);
    const s = separarParaGravacao(config, r, base);
    expect(s.ignorar.map((l) => l.numero_linha)).toEqual([2]);
    expect(s.gravar.map((l) => l.numero_linha)).toEqual([3]);
    expect(r[0]!.alertas[0]!.mensagem).toBe('Sem alterações: o cliente "Loja PJ" já está igual no cadastro; a linha será ignorada');

    const [mudou] = await validarPlanilha(config, cab, [linha(2, { nome: "Loja PJ", cnpj_cpf: CNPJ, cidade: "Anápolis" })], base);
    expect(mudou!.alertas[0]!.mensagem).toContain("vão atualizar o cliente");
    expect(mudou!.dados).toEqual({ nome: "Loja PJ", documento: "11222333000181", cidade: "Anápolis" });
    expect("email" in mudou!.dados).toBe(false); // vazio não apaga
  });

  it("lê .xlsx com CNPJ/CPF numérico (zeros à esquerda recuperados) e exporta as linhas com erro no formato do modelo", async () => {
    const ws = XLSX.utils.aoa_to_sheet([cab, cab.map((c) => (c === "nome" ? "Zero à esquerda" : c === "cnpj_cpf" ? 1222333000128 : ""))]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "clientes");
    const lido = await lerPlanilha(new File([XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer], "clientes.xlsx"));
    const [l] = await validarPlanilha(config, lido.cabecalho, lido.linhas, new Map());
    expect(l!.dados.documento).toBe("01222333000128");

    const brutas = [linha(2, { nome: "Ok", cnpj_cpf: CPF }), linha(3, { nome: "Sem doc" })];
    const r = await validarPlanilha(config, cab, brutas, new Map());
    const csv = linhasComErroCsv(config, brutas, { linhas: r });
    expect(csv.split("\r\n")).toEqual(["﻿" + cab.join(";"), "Sem doc;;;;;;;;;"]);
  });
});
