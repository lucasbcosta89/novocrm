import { describe, expect, it } from "vitest";
import { COLUNAS_REPRESENTADA, importacaoRepresentadas as config, semAlteracaoRepresentada } from "@/lib/cadastros/importacao-representadas";
import { lerPlanilha, linhasComErroCsv, relatorioErrosCsv } from "@/lib/importacao/arquivos";
import { chaveImportacao, separarParaGravacao, validarPlanilha, type LinhaBruta } from "@/lib/importacao/motor";

const cab = [...COLUNAS_REPRESENTADA];
type Campo = (typeof COLUNAS_REPRESENTADA)[number];
const linha = (n: number, v: Partial<Record<Campo, string>>): LinhaBruta => ({ numero_linha: n, valores: cab.map((c) => v[c] ?? "") });
const A = { razao_social: "Alfa Calçados Ltda", cnpj: "11.222.333/0001-81", email_comercial: "a@a.com", cidade: "Goiânia", uf: "GO", comissao_percentual: "7,5" };
const B = { razao_social: "Beta Têxtil SA", cnpj: "45723174000110", email_comercial: "b@b.com", cidade: "São Paulo", uf: "XX", comissao_percentual: "5" };
const C = { razao_social: "Gama Moda ME", cnpj: "33000167000101", email_comercial: "c@c.com", cidade: "Natal", uf: "RN", comissao_percentual: "10" };

/** Simula a base depois da gravação: o que entrou vira "existente" com os valores gravados (numeric volta como texto). */
function baseApos(gravadas: { dados: Record<string, string | number | null> }[]) {
  const m = new Map<string, unknown>();
  gravadas.forEach((l, i) => {
    const valores = Object.fromEntries(Object.entries(l.dados).map(([k, v]) => [k, typeof v === "number" ? v.toFixed(2) : v]));
    m.set(chaveImportacao("cnpj", l.dados.cnpj), { codigo: `REP-000${i + 1}`, valores });
  });
  return m;
}

describe("representadas fase 5 — relatório de erros e reenvio", () => {
  it("relatório mostra número da linha, campo e mensagem; CSV com BOM e acentos (abre certo no Excel)", async () => {
    const r = await validarPlanilha(config, cab, [linha(2, A), linha(3, B)], new Map());
    const csv = relatorioErrosCsv({ linhas: r });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")).toEqual(["﻿Linha;Classificação;Tipo;Campo;Mensagem;Valor recebido", "3;Inválida;Erro;uf;UF inválida;XX"]);
    const decodificado = new TextDecoder("utf-8").decode(new TextEncoder().encode(csv));
    expect(decodificado).toContain("Classificação");
  });

  it("linhas com erro saem no formato exato do modelo e o arquivo volta a ser lido pelo importador", async () => {
    const brutas = [linha(2, A), linha(3, B), linha(4, C)];
    const r = await validarPlanilha(config, cab, brutas, new Map());
    const csv = linhasComErroCsv(config, brutas, { linhas: r });
    const relido = await lerPlanilha(new File([csv], "corrigir.csv"));
    expect(relido.cabecalho).toEqual(cab);
    expect(relido.linhas).toHaveLength(1);
    expect(relido.linhas[0]!.valores[cab.indexOf("razao_social")]).toBe("Beta Têxtil SA");
  });

  it("reenvio do arquivo corrigido importa só o que antes falhou, sem duplicar o que já entrou", async () => {
    // 1º envio: A e C entram, B (UF inválida) fica de fora
    const r1 = await validarPlanilha(config, cab, [linha(2, A), linha(3, B), linha(4, C)], new Map());
    const s1 = separarParaGravacao(config, r1, new Map());
    expect([s1.gravar.length, s1.ignorar.length, s1.comErro.length]).toEqual([2, 0, 1]);

    // 2º envio: o MESMO arquivo, com B corrigido
    const base = baseApos(s1.gravar);
    const r2 = await validarPlanilha(config, cab, [linha(2, A), linha(3, { ...B, uf: "SP" }), linha(4, C)], base);
    const s2 = separarParaGravacao(config, r2, base);
    expect(s2.gravar.map((l) => l.numero_linha)).toEqual([3]);        // só a que falhou
    expect(s2.ignorar.map((l) => l.numero_linha)).toEqual([2, 4]);    // já iguais: ignoradas, sem duplicar
    expect(s2.comErro).toEqual([]);
    expect(r2[0]!.alertas[0]!.mensagem).toBe("Sem alterações: REP-0001 já está igual no cadastro; a linha será ignorada");
  });

  it("linha já cadastrada com algum campo diferente é atualização (não ignorada, não duplicada)", async () => {
    const r1 = await validarPlanilha(config, cab, [linha(2, A)], new Map());
    const base = baseApos(separarParaGravacao(config, r1, new Map()).gravar);
    const r2 = await validarPlanilha(config, cab, [linha(2, { ...A, comissao_percentual: "8" })], base);
    const s2 = separarParaGravacao(config, r2, base);
    expect(s2.gravar).toHaveLength(1);
    expect(r2[0]!.alertas[0]!.mensagem).toContain("vão atualizar");
  });

  it("comparação de 'sem alterações' trata número do banco (7.50) igual ao da planilha (7,5)", () => {
    expect(semAlteracaoRepresentada({ cnpj: "11222333000181", comissao_percentual: 7.5 }, { codigo: "REP-0001", valores: { cnpj: "11222333000181", comissao_percentual: "7.50" } })).toBe(true);
    expect(semAlteracaoRepresentada({ cnpj: "11222333000181", telefone: "62999998888" }, { codigo: "REP-0001", valores: { cnpj: "11222333000181", telefone: null } })).toBe(false);
  });
});
