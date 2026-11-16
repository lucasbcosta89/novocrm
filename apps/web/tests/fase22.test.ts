import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { indicadoresComissao } from "@/lib/comissoes/regras";
import { acoesDoStatus, selecionavelEmLote } from "@/lib/comissoes/status";
import {
  chavePedido, chaveUnicaDevolucao, COLUNA_COMISSAO_ESTORNO, importacaoDevolucoes as config, percentualDoItem, type PedidoOriginal,
} from "@/lib/import/devolucoes";
import { chaveImportacao, separarParaGravacao, validarPlanilha, type LinhaBruta } from "@/lib/importacao/motor";

const ITEM = "00000000-0000-4000-8000-0000000000a1";
const pedido: PedidoOriginal = {
  id: "p1", codigo: "P000101", status_comissao: "recebida",
  itens: [{ id: ITEM, sku: "SKU-001", descricao: "Camiseta", quantidade: 10, subtotal: 1000, comissao_percentual: 5, comissao_valor: 50, comissao_origem: "calculada", origem_calculo: "representada" }],
};
const base = (extra: [string, unknown][] = []) => new Map<string, unknown>([[chavePedido("P000101"), pedido], ...extra]);
const cab = config.colunasEsperadas;
const linha = (n: number, o: Partial<Record<string, string>> = {}, formulas?: LinhaBruta["formulas"]): LinhaBruta => ({
  numero_linha: n, formulas,
  valores: cab.map((c) => ({ "Código do Pedido": "P000101", SKU: "SKU-001", "Quantidade Devolvida": "2", "Valor Total": "200", "Data da Devolução": "05/11/2026", ...o } as Record<string, string>)[c] ?? ""),
});

describe("fase 22 — modelo Excel (I)", () => {
  it("três abas, 11 colunas na ordem (obrigatórias com *) e 5 exemplos sem fórmula", () => {
    const arq = join(__dirname, "..", "public", "templates", "modelo-devolucoes.xlsx");
    expect(existsSync(arq)).toBe(true);
    const wb = XLSX.read(readFileSync(arq));
    expect(wb.SheetNames).toEqual(["Devoluções", "Instruções", "Exemplos"]);
    const h = (XLSX.utils.sheet_to_json(wb.Sheets["Devoluções"]!, { header: 1 })[0] as string[]).map((x) => x.replace(/ \*$/, ""));
    expect(h).toEqual(cab);
    const ex = XLSX.utils.sheet_to_json(wb.Sheets["Exemplos"]!, { header: 1 });
    expect(ex.length - 1).toBe(5);
    expect(Object.values(wb.Sheets["Exemplos"]!).some((c) => c && typeof c === "object" && "f" in c)).toBe(false);
  });
});

describe("fase 22 — importação de devoluções (C/D/F)", () => {
  it("chave única normalizada (trim, minúsculas, sem acento)", () => {
    expect(chaveUnicaDevolucao(" P000101 ", "SKU-Ação", "2026-11-05", 2, 200)).toBe("p000101|sku-acao|2026-11-05|2|200.00");
  });
  it("válida: comissão vazia = valor total × percentual do item original (nunca zero); cabeçalho com * aceito", async () => {
    const cabAsterisco = cab.map((c) => (["Código do Pedido", "SKU", "Quantidade Devolvida", "Data da Devolução"].includes(c) ? `${c} *` : c));
    const [l] = await validarPlanilha(config, cabAsterisco, [linha(2)], base());
    expect(l!.classificacao).toBe("valida");
    expect([l!.dados.comissao_estornada, l!.dados.percentual, l!.dados.origem_calculo, l!.dados.pedido_item_id]).toEqual([10, 5, "representada", ITEM]);
    const [z] = await validarPlanilha(config, cab, [linha(2, { [COLUNA_COMISSAO_ESTORNO]: "0" })], base());
    expect(z!.dados.comissao_estornada).toBe(10); // zero = ausência (Fase 20 D.1)
  });
  it("percentual efetivo de item com comissão da planilha = valor ÷ subtotal", () => {
    expect(percentualDoItem({ ...pedido.itens[0]!, comissao_origem: "planilha", comissao_valor: 75, comissao_percentual: 5 })).toBe(7.5);
  });
  it("valor total omitido: quantidade × unitário; ambos omitidos: unitário do item original", async () => {
    const [a] = await validarPlanilha(config, cab, [linha(2, { "Valor Total": "", "Valor Unitário": "90" })], base());
    expect(a!.dados.valor_total).toBe(180);
    const [b] = await validarPlanilha(config, cab, [linha(2, { "Valor Total": "" })], base());
    expect([b!.dados.valor_unitario, b!.dados.valor_total]).toEqual([100, 200]);
  });
  it("pedido não encontrado = linha inválida (A.4); SKU fora do pedido = inválida", async () => {
    const [a] = await validarPlanilha(config, cab, [linha(2, { "Código do Pedido": "NAO-EXISTE" })], base());
    expect(a!.classificacao).toBe("invalida");
    const [b] = await validarPlanilha(config, cab, [linha(2, { SKU: "OUTRO" })], base());
    expect(b!.erros[0]!.mensagem).toContain("não está no pedido");
  });
  it("quantidade acima da vendida (somando o já devolvido e o arquivo) → inválida com a mensagem exata", async () => {
    const r = await validarPlanilha(config, cab, [linha(2, { "Quantidade Devolvida": "6", "Valor Total": "600" }), linha(3, { "Quantidade Devolvida": "3", "Valor Total": "300" })],
      base([[chaveImportacao("item", ITEM), { quantidade: 2, estornado: 0 }]]));
    expect(r[0]!.classificacao).not.toBe("invalida");
    expect(r[1]!.erros.map((e) => e.mensagem)).toContain("Quantidade devolvida (11) excede a vendida (10) para este item.");
  });
  it("comissão acima do saldo do item → com alerta e LIMITADA ao saldo", async () => {
    const [l] = await validarPlanilha(config, cab, [linha(2, { [COLUNA_COMISSAO_ESTORNO]: "999" })], base([[chaveImportacao("item", ITEM), { quantidade: 0, estornado: 20 }]]));
    expect(l!.classificacao).toBe("com_alerta");
    expect(l!.dados.comissao_estornada).toBe(30);
    expect(l!.alertas[0]!.mensagem).toMatch(/limitada a R\$\s30,00/);
  });
  it("reenvio: mesma chave = duplicada (ignorada, nada a gravar); comissão diferente = conflito (não sobrescreve)", async () => {
    const chave = chaveUnicaDevolucao("P000101", "SKU-001", "2026-11-05", 2, 200);
    const existentes = base([[chaveImportacao("chave_unica", chave), { comissao_estornada: 10, numero: "DV000001" }], [chaveImportacao("item", ITEM), { quantidade: 2, estornado: 10 }]]);
    const linhas = await validarPlanilha(config, cab, [linha(2)], existentes);
    const sep = separarParaGravacao(config, linhas, existentes);
    expect([sep.gravar.length, sep.ignorar.length]).toEqual([0, 1]);
    expect(config.resumoExtra!(linhas)[0]).toEqual({ rotulo: "Duplicadas (já importadas)", valor: 1 });
    const [c] = await validarPlanilha(config, cab, [linha(2, { [COLUNA_COMISSAO_ESTORNO]: "7" })], existentes);
    expect(c!.classificacao).toBe("invalida");
    expect(c!.erros[0]!.mensagem).toContain("conflito com a devolução DV000001");
  });
  it("fórmula sem valor em cache: linha com alerta, importada com o valor calculado", async () => {
    const col = cab.indexOf(COLUNA_COMISSAO_ESTORNO);
    const [l] = await validarPlanilha(config, cab, [linha(7, {}, [{ coluna: col, tipo: "sem_valor" }])], base());
    expect([l!.classificacao, l!.dados.comissao_estornada]).toEqual(["com_alerta", 10]);
    expect(l!.alertas[0]!.mensagem).toContain("Linha 7, campo Comissão a Estornar (R$): a célula contém fórmula sem valor calculado");
  });
  it("data em serial do Excel é lida corretamente", async () => {
    const [l] = await validarPlanilha(config, cab, [linha(2, { "Data da Devolução": "46331", "Data de Processamento": "46341.5" })], base());
    expect([l!.dados.data_devolucao, l!.dados.data_processamento]).toEqual(["2026-11-05", "2026-11-15"]);
  });
  it("prévia: válidas, com alerta, inválidas, duplicadas e VALOR TOTAL a estornar", async () => {
    const linhas = await validarPlanilha(config, cab, [linha(2), linha(3, { "Data da Devolução": "06/11/2026", [COLUNA_COMISSAO_ESTORNO]: "4,5" }), linha(4, { "Código do Pedido": "X" })], base());
    expect(linhas.map((l) => l.classificacao)).toEqual(["valida", "valida", "invalida"]);
    expect(config.resumoExtra!(linhas)[1]).toEqual({ rotulo: "Valor total a estornar", valor: 14.5, formato: "moeda" });
    expect(config.previa!(linhas, base()).linhas).toHaveLength(2);
  });
});

describe("fase 22 — saldo, dashboard e ações (G/H)", () => {
  it("1.000 recebidos e 150 estornados → bruta 1.000, devoluções 150, líquido 850", () => {
    const d = "2026-11-10";
    const r = indicadoresComissao([
      { status: "recebida", valor: 1000, tipo: "normal", data_prevista_recebimento: d, data_recebimento: d },
      { status: "recebida", valor: -150, tipo: "estorno", data_prevista_recebimento: d, data_recebimento: d },
    ], () => true);
    expect([r.recebida_bruta, r.devolucoes, r.recebida]).toEqual([1000, 150, 850]);
  });
  it("estorno: fora do lote; só 'Marcar como processada' / 'Reabrir devolução'", () => {
    expect(selecionavelEmLote("prevista", "estorno")).toBe(false);
    expect(acoesDoStatus("prevista", "estorno", { status: "pendente" })).toMatchObject({ processar: true, reabrirDevolucao: false, marcarRecebida: false, definir: false, editarData: false });
    expect(acoesDoStatus("recebida", "estorno", { status: "processada" })).toMatchObject({ processar: false, reabrirDevolucao: true, reabrir: false });
  });
});
