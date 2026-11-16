import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { comissaoItem, DICA_COMISSAO } from "@/lib/comissao";
import { agruparPedidos, COLUNA_COMISSAO, importacaoPedidos as config, MSG_COMISSAO_AUSENTE, type ProdutoExistente } from "@/lib/cadastros/importacao-pedidos";
import { lerPlanilha } from "@/lib/importacao/arquivos";
import { chaveImportacao, problemasCabecalho, validarPlanilha, type LinhaBruta } from "@/lib/importacao/motor";
import { subtotalItem } from "@/lib/validacao";

const CNPJ = "11222333000181";
const REP = "00000000-0000-4000-8000-000000000001";
const prod: ProdutoExistente = { produto_id: "p-S1", representada_id: REP, representada: "Alfa", nome: "Produto S1", preco: 100 };
const base = () => new Map<string, unknown>([
  [chaveImportacao("cliente", CNPJ), { id: "cli", nome: "Loja" }],
  [chaveImportacao("sku", "S1"), [prod]],
]);
const cab = config.colunasEsperadas;
const COL = cab.indexOf(COLUNA_COMISSAO);
const valores = (comissao: string) => cab.map((c) => ({
  "Data do Pedido": "20/10/2026", "CNPJ/CPF do Cliente": CNPJ, "SKU do Produto": "S1", "Quantidade": "10", "Preço Unitário": "100", "Desconto (%)": "5", [COLUNA_COMISSAO]: comissao,
} as Record<string, string>)[c] ?? "");
const uma = async (l: LinhaBruta, cabecalho: readonly string[] = cab) => (await validarPlanilha(config, cabecalho, [l], base()))[0]!;

describe("fase 20 — comissão (R$) no formulário", () => {
  it("10 un × R$ 100,00, 5% de desconto, 5% de comissão = R$ 47,50 (subtotal × %, como o banco grava)", () => {
    expect(subtotalItem(10, 100, 5)).toBe(950);
    expect(comissaoItem(subtotalItem(10, 100, 5), 5)).toBe(47.5);
    expect(comissaoItem(950, 0)).toBe(0);
    expect(comissaoItem(subtotalItem(3, 33.33, 0), 7.5)).toBe(7.5); // 99,99 × 7,5% = 7,49925 → 7,50
  });
  it("tooltip com o texto exato", () => {
    expect(DICA_COMISSAO).toBe("A comissão é calculada automaticamente pelo percentual do produto ou da representada. Se houver divergência de valor, você pode alterar a comissão após o lançamento do pedido na página de Comissões.");
  });
});

describe("fase 20 — coluna 'Comissão (R$)' na importação", () => {
  it("modelo novo tem a coluna opcional (última); o modelo antigo continua válido", () => {
    expect(cab.at(-2)).toBe(COLUNA_COMISSAO); // Fase 21: "Data de Faturamento" é a última
    expect(config.colunasObrigatorias).not.toContain(COLUNA_COMISSAO);
    expect(problemasCabecalho(cab, cab.slice(0, -1), config.colunasOpcionais)).toEqual([]);
    expect(problemasCabecalho(cab, cab.slice(0, -2), config.colunasOpcionais)).toEqual([]);
    expect(problemasCabecalho(cab, cab.slice(0, -3), config.colunasOpcionais).length).toBeGreaterThan(0); // só as opcionais do fim podem faltar
  });
  it("47,50 na planilha prevalece (linha válida)", async () => {
    const r = await uma({ numero_linha: 2, valores: valores("47,50") });
    expect([r.classificacao, r.dados.comissao_valor, r.dados.comissao_ausente]).toEqual(["valida", 47.5, undefined]);
  });
  it("vazia e zerada são a MESMA coisa: importada com alerta, calculada pelo cadastro, marcada para análise", async () => {
    for (const c of ["", "0", "0,00"]) {
      const r = await uma({ numero_linha: 2, valores: valores(c) });
      expect(r.classificacao).toBe("com_alerta");
      expect(r.dados.comissao_valor).toBeUndefined();
      expect(r.dados.comissao_ausente).toBe(1);
      expect(r.alertas[0]!.mensagem).toBe(MSG_COMISSAO_AUSENTE);
    }
    const negativa = await uma({ numero_linha: 2, valores: valores("-3") });
    expect(negativa.classificacao).toBe("invalida");
  });
  it("modelo antigo (sem a coluna): sem alerta nem marca (comportamento anterior)", async () => {
    const r = await uma({ numero_linha: 2, valores: valores("").slice(0, -2) }, cab.slice(0, -2));
    expect([r.classificacao, r.dados.comissao_ausente]).toEqual(["valida", undefined]);
  });
  it("fórmula sem valor em cache e fórmula que retorna zero: alerta por linha, tratadas como ausência", async () => {
    const sem = await uma({ numero_linha: 7, valores: valores(""), formulas: [{ coluna: COL, tipo: "sem_valor" }] });
    expect(sem.classificacao).toBe("com_alerta");
    expect(sem.alertas[0]!.mensagem).toContain("Linha 7, campo Comissão (R$): a célula contém fórmula sem valor calculado. Abra e salve o arquivo no Excel e reenvie, ou preencha o valor manualmente.");
    const zero = await uma({ numero_linha: 8, valores: valores("0"), formulas: [{ coluna: COL, tipo: "zero" }] });
    expect(zero.alertas[0]!.mensagem).toContain("Linha 8, campo Comissão (R$): a fórmula retornou zero");
    expect(zero.dados.comissao_ausente).toBe(1);
  });
  it("resumo da conferência conta as linhas com comissão não informada ou zerada; itens levam a marca ao banco", async () => {
    const linhas = await validarPlanilha(config, cab, [
      { numero_linha: 2, valores: valores("47,50") }, { numero_linha: 3, valores: valores("") }, { numero_linha: 4, valores: valores("0") },
    ], base());
    expect(config.resumoExtra!(linhas)).toEqual([{ rotulo: "Comissão não informada ou zerada", valor: 2 }]);
    const [g] = agruparPedidos(linhas.map((l) => ({ ...l, erros: [], alertas: [] })), base());
    expect(g!.itens.map((i) => [i.comissao_valor, i.comissao_ausente])).toEqual([[47.5, false], [null, true], [null, true]]);
  });
});

describe("fase 20 — leitura de fórmulas (lerPlanilha)", () => {
  it("vale o valor em cache; fórmula sem cache e com resultado zero são sinalizadas (texto da fórmula nunca usado)", async () => {
    const ws: XLSX.WorkSheet = { "!ref": "A1:C4", A1: { t: "s", v: "x" }, B1: { t: "s", v: "y" }, C1: { t: "s", v: "z" },
      A2: { t: "n", v: 10 }, B2: { t: "n", f: "A2*2", v: 20 }, C2: { t: "s", v: "ok" },
      A3: { t: "n", v: 10 }, B3: { t: "n", f: "A3*2" }, C3: { t: "s", v: "ok" },
      A4: { t: "n", v: 10 }, B4: { t: "n", f: "A4*0", v: 0 }, C4: { t: "s", v: "ok" } };
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "s");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const { linhas } = await lerPlanilha(new File([bytes], "f.xlsx"));
    expect(linhas.map((l) => [l.valores[1], l.formulas])).toEqual([
      ["20", undefined],
      ["", [{ coluna: 1, tipo: "sem_valor" }]],
      ["0", [{ coluna: 1, tipo: "zero" }]],
    ]);
  });
});
