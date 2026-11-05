import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { agruparPedidos, importacaoPedidos as config, ROTULOS_PEDIDO, type ProdutoExistente } from "@/lib/cadastros/importacao-pedidos";
import { formatarMoeda } from "@/lib/formato";
import { parseData } from "@/lib/import/valores";
import { lerPlanilha } from "@/lib/importacao/arquivos";
import { chaveImportacao, problemasCabecalho, separarParaGravacao, validarPlanilha, type LinhaBruta } from "@/lib/importacao/motor";
import { IMPORTACOES } from "@/lib/importacao/registro";

const CNPJ_A = "11222333000181";
const CNPJ_B = "45723174000110";
const REP1 = "00000000-0000-4000-8000-000000000001";
const REP2 = "00000000-0000-4000-8000-000000000002";
const prod = (sku: string, rep: string, preco: number): ProdutoExistente => ({
  produto_id: `p-${sku}-${rep.slice(-1)}`, representada_id: rep, representada: rep === REP1 ? "Alfa" : "Beta", nome: `Produto ${sku}`, preco,
});
const base = () => new Map<string, unknown>([
  [chaveImportacao("cliente", CNPJ_A), { id: "cli-a", nome: "Loja A" }],
  [chaveImportacao("cliente", CNPJ_B), { id: "cli-b", nome: "Loja B" }],
  [chaveImportacao("sku", "S1"), [prod("S1", REP1, 10)]],
  [chaveImportacao("sku", "S2"), [prod("S2", REP1, 20)]],
  [chaveImportacao("sku", "DUP"), [prod("DUP", REP1, 5), prod("DUP", REP2, 5)]],
  [chaveImportacao("sku", "B1"), [prod("B1", REP2, 7)]],
  [chaveImportacao("codigo_pedido", "9999"), true],
]);
type Campos = Partial<Record<(typeof ROTULOS_PEDIDO)[number], string>>;
const linha = (n: number, v: Campos): LinhaBruta => ({ numero_linha: n, valores: ROTULOS_PEDIDO.map((c) => v[c] ?? "") });
const item = (num: string, data: string, doc: string, sku: string, qtd = "1", preco = "10"): Campos => ({
  "Número do Pedido": num, "Data do Pedido": data, "CNPJ/CPF do Cliente": doc, "SKU do Produto": sku, "Quantidade": qtd, "Preço Unitário": preco,
});

describe("fase 17 — importação de pedidos", () => {
  it("parseData: DD/MM/AAAA, ISO e número de série do Excel; data inexistente é rejeitada", () => {
    expect(parseData("20/10/2026")).toBe("2026-10-20");
    expect(parseData("2026-10-20")).toBe("2026-10-20");
    expect(parseData("46315.5")).toBe("2026-10-20");
    expect(parseData("31/02/2026")).toBeNull();
    expect(parseData("ontem")).toBeNull();
  });

  it("registrada no motor genérico; cabeçalho é contrato (coluna renomeada lista o problema)", () => {
    expect(IMPORTACOES.pedidos).toBe(config);
    expect(config.colunasObrigatorias).toEqual(["Data do Pedido", "CNPJ/CPF do Cliente", "SKU do Produto", "Quantidade", "Preço Unitário"]);
    const renomeado = ROTULOS_PEDIDO.map((c) => (c === "SKU do Produto" ? "SKU" : c));
    expect(problemasCabecalho(config.colunasEsperadas, renomeado)[0]!.mensagem).toBe('Cabeçalho fora do padrão: coluna 4 deveria ser "SKU do Produto", veio "SKU"');
  });

  it("agrupa: mesmo número = 1 pedido; vazio + mesmo cliente/data consecutivos = 1 automático; data diferente = outro", async () => {
    const linhas = await validarPlanilha(config, config.colunasEsperadas, [
      linha(2, item("1001", "20/10/2026", CNPJ_A, "S1")),
      linha(3, item("1001", "20/10/2026", CNPJ_A, "S2", "2", "20")),
      linha(4, item("", "21/10/2026", CNPJ_B, "S1")),
      linha(5, item("", "21/10/2026", CNPJ_B, "S2")),
      linha(6, item("", "22/10/2026", CNPJ_B, "S1")),
    ], base());
    expect(linhas.some((l) => l.classificacao === "invalida")).toBe(false); // preço ≠ Catálogo só gera alerta
    const grupos = agruparPedidos(linhas.map((l) => ({ ...l, erros: [], alertas: [] })), base());
    expect(grupos.map((g) => [g.codigo, g.data, g.cliente, g.representada, g.linhas])).toEqual([
      ["1001", "2026-10-20", "Loja A", "Alfa", [2, 3]],
      [null, "2026-10-21", "Loja B", "Alfa", [4, 5]],
      [null, "2026-10-22", "Loja B", "Alfa", [6]],
    ]);
    expect(config.previa!(linhas, base()).linhas[0]).toEqual(["1001", "20/10/2026", "Loja A", "Alfa", 2, formatarMoeda(50), "—"]);
  });

  it("SKU inexistente: item entra com pendência (alerta, não erro); preço >10% diferente: pendência informativa; preço da planilha prevalece", async () => {
    const linhas = await validarPlanilha(config, config.colunasEsperadas, [
      linha(2, item("", "20/10/2026", CNPJ_A, "S1", "1", "10")),
      linha(3, item("", "20/10/2026", CNPJ_A, "NOVO", "3", "4,50")),
      linha(4, item("", "20/10/2026", CNPJ_A, "S2", "1", "30")),
    ], base());
    expect(linhas.map((l) => l.classificacao)).toEqual(["valida", "com_alerta", "com_alerta"]);
    expect(linhas[1]!.alertas[0]!.mensagem).toBe("Produto não cadastrado no Catálogo de Alfa: item gravado com pendência");
    expect(linhas[2]!.alertas[0]!.mensagem).toBe(`Preço da planilha (${formatarMoeda(30)}) difere do Catálogo (${formatarMoeda(20)}): vale o da planilha`);
    const [g] = agruparPedidos(linhas.map((l) => ({ ...l, erros: [], alertas: [] })), base());
    expect(g!.itens.map((i) => [i.sku, i.produto_id, i.preco_unitario, i.pendencia])).toEqual([
      ["S1", "p-S1-1", 10, null], ["NOVO", null, 4.5, "produto_nao_cadastrado"], ["S2", "p-S2-1", 30, "preco_divergente"],
    ]);
    expect(separarParaGravacao(config, linhas, base()).gravar).toHaveLength(3);
  });

  it("cliente não cadastrado, número já existente e linha com erro invalidam o pedido inteiro (nunca grava pela metade)", async () => {
    const linhas = await validarPlanilha(config, config.colunasEsperadas, [
      linha(2, item("1001", "20/10/2026", CNPJ_A, "S1")),
      linha(3, item("1001", "20/10/2026", CNPJ_A, "S2", "0")),
      linha(4, item("", "20/10/2026", "52998224725", "S1")),
      linha(5, item("9999", "20/10/2026", CNPJ_A, "S1")),
      linha(6, { ...item("", "31/02/2026", CNPJ_A, "S1") }),
    ], base());
    expect(linhas.map((l) => l.classificacao)).toEqual(["invalida", "invalida", "invalida", "invalida", "invalida"]);
    expect(linhas[0]!.erros[0]!.mensagem).toBe("Pedido 1001 ignorado: a linha 3 deste pedido tem erro");
    expect(linhas[1]!.erros[0]!.mensagem).toBe("Quantidade deve ser um número maior ou igual a 1");
    expect(linhas[2]!.erros[0]!.mensagem).toBe("Cliente não cadastrado: cadastre-o antes (página Clientes ou “Cadastrar Clientes com Excel”)");
    expect(linhas[3]!.erros[0]!.mensagem).toBe("Já existe um pedido com o número 9999 (não é sobrescrito)");
    expect(linhas[4]!.erros[0]!.mensagem).toBe("Data do Pedido inválida: use DD/MM/AAAA (ex.: 20/10/2026)");
  });

  it("representada pelo SKU: sem SKU no Catálogo, representadas diferentes ou SKU ambíguo invalidam; ambíguo com desempate resolve", async () => {
    const validar = (linhas: LinhaBruta[]) => validarPlanilha(config, config.colunasEsperadas, linhas, base());
    const [nenhum] = await validar([linha(2, item("", "20/10/2026", CNPJ_A, "X1"))]);
    expect(nenhum!.erros[0]!.mensagem).toContain("nenhum SKU está no Catálogo");
    const mistos = await validar([linha(2, item("7", "20/10/2026", CNPJ_A, "S1")), linha(3, item("7", "20/10/2026", CNPJ_A, "B1"))]);
    expect(mistos[0]!.erros[0]!.mensagem).toContain("itens de representadas diferentes no mesmo pedido (Alfa, Beta)");
    const [ambiguo] = await validar([linha(2, item("", "20/10/2026", CNPJ_A, "DUP"))]);
    expect(ambiguo!.erros[0]!.mensagem).toContain("existem em mais de uma representada");
    const desempate = await validar([linha(2, item("8", "20/10/2026", CNPJ_A, "DUP")), linha(3, item("8", "20/10/2026", CNPJ_A, "B1"))]);
    expect(desempate.some((l) => l.classificacao === "invalida")).toBe(false);
    expect(agruparPedidos(desempate, base())[0]!.representada).toBe("Beta");
  });

  it("modelo: 3 abas, cabeçalho exato, 5 exemplos com número realmente vazio e lido de volta pelo importador", async () => {
    const caminho = resolve(__dirname, "../public/templates/modelo-cadastro-pedidos.xlsx");
    const wb = XLSX.read(readFileSync(caminho));
    expect(wb.SheetNames).toEqual(["Pedidos", "Como Funciona", "Instruções"]);
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Pedidos!, { header: 1, raw: true, blankrows: false });
    expect(matriz[0]).toEqual([...ROTULOS_PEDIDO]);
    expect(matriz.slice(1, 6).map((l) => l[0] ?? null)).toEqual(["1001", "1001", null, null, null]);
    const lido = await lerPlanilha(new File([readFileSync(caminho)], "modelo-cadastro-pedidos.xlsx"));
    expect(lido.linhas).toHaveLength(5);
    expect(lido.cabecalho).toEqual([...ROTULOS_PEDIDO]);
  });
});

describe("acréscimo por item (venda acima do preço de tabela)", () => {
  it("subtotal = qtd × preço × (1 + acréscimo%) × (1 − desconto%), igual ao banco", async () => {
    const { subtotalItem, pedidoSchema } = await import("@/lib/validacao");
    expect(subtotalItem(2, 120, 0, 10)).toBe(264);
    expect(subtotalItem(1, 100, 10, 20)).toBe(108);
    expect(subtotalItem(3, 25.9, 0)).toBe(77.7);
    const ID = "11111111-1111-4111-8111-111111111111";
    const p = pedidoSchema.parse({ representada_id: ID, cliente_id: ID, itens: [{ produto_id: ID, quantidade: "1", acrescimo_percentual: "7,5" }] });
    expect(p.itens[0]!.acrescimo_percentual).toBe(7.5);
    expect(pedidoSchema.safeParse({ representada_id: ID, cliente_id: ID, itens: [{ produto_id: ID, quantidade: 1, acrescimo_percentual: 150 }] }).success).toBe(false);
  });

  it("planilha de pedidos: coluna 'Acréscimo (%)' opcional, validada e levada ao item", async () => {
    expect(ROTULOS_PEDIDO).toContain("Acréscimo (%)");
    expect(config.colunasObrigatorias).not.toContain("Acréscimo (%)");
    const linhas = await validarPlanilha(config, config.colunasEsperadas, [
      linha(2, { ...item("", "20/10/2026", CNPJ_A, "S1", "2", "10"), "Acréscimo (%)": "10" }),
      linha(3, { ...item("", "21/10/2026", CNPJ_A, "S1", "1", "10"), "Acréscimo (%)": "150" }),
    ], base());
    expect(linhas[0]!.classificacao).toBe("valida");
    expect(linhas[1]!.erros[0]!.mensagem).toBe("Acréscimo deve estar entre 0 e 100");
    const [g] = agruparPedidos([linhas[0]!], base());
    expect(g!.itens[0]!.acrescimo_percentual).toBe(10);
    expect(config.previa!([linhas[0]!], base()).linhas[0]![5]).toBe(formatarMoeda(22));
  });
});
