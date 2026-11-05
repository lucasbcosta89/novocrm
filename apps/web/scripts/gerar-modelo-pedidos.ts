// Gera public/templates/modelo-cadastro-pedidos.xlsx (modelo da importação de pedidos, Fase 17).
// O cabeçalho é contrato: precisa bater com COLUNAS_PEDIDO de src/lib/cadastros/importacao-pedidos.ts.
// Rodar: pnpm gerar:modelo:pedidos (Node com suporte a TypeScript nativo).
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const aqui = dirname(fileURLToPath(import.meta.url));
const destino = resolve(aqui, "../public/templates/modelo-cadastro-pedidos.xlsx");

type Coluna = { titulo: string; largura: number; obrigatoria: boolean; formato: string; exemplo: string; obs: string; numFmt?: string };
const COLUNAS: Coluna[] = [
  { titulo: "Número do Pedido", largura: 16, obrigatoria: false, formato: "Texto (até 40)", exemplo: "1001", obs: "Opcional. Linhas com o mesmo número formam um pedido. Vazio: o número é gerado automaticamente (P + dígitos)." },
  { titulo: "Data do Pedido", largura: 14, obrigatoria: true, formato: "DD/MM/AAAA", exemplo: "20/10/2026", obs: "Data em que o pedido foi feito.", numFmt: "dd/mm/yyyy" },
  { titulo: "CNPJ/CPF do Cliente", largura: 22, obrigatoria: true, formato: "CNPJ (14) ou CPF (11), com ou sem máscara", exemplo: "11.222.333/0001-81", obs: "O cliente precisa estar cadastrado na plataforma (página Clientes ou importação de clientes)." },
  { titulo: "SKU do Produto", largura: 16, obrigatoria: true, formato: "Texto (até 60)", exemplo: "SKU-001", obs: "SKU do Catálogo. Também identifica a representada do pedido. SKU não encontrado vira pendência (o item é gravado)." },
  { titulo: "Descrição do Produto", largura: 30, obrigatoria: false, formato: "Texto (até 200)", exemplo: "Camiseta básica", obs: "Usada quando o SKU ainda não está no Catálogo (e como nome sugerido ao cadastrá-lo)." },
  { titulo: "Quantidade", largura: 12, obrigatoria: true, formato: "Número inteiro ≥ 1", exemplo: "10", obs: "", numFmt: "0" },
  { titulo: "Preço Unitário", largura: 15, obrigatoria: true, formato: "R$ #.##0,00", exemplo: "25,90", obs: "Vale SEMPRE o preço da planilha, mesmo diferente do Catálogo (diferença acima de 10% fica só sinalizada).", numFmt: '"R$" #,##0.00' },
  { titulo: "Desconto (%)", largura: 13, obrigatoria: false, formato: "0 a 100, 2 casas", exemplo: "5,00", obs: "Desconto do item. Vazio = 0.", numFmt: "0.00" },
  { titulo: "Acréscimo (%)", largura: 13, obrigatoria: false, formato: "0 a 100, 2 casas", exemplo: "10,00", obs: "Venda acima do preço de tabela: % somado ao preço do item. Vazio = 0. Subtotal = qtd × preço × (1 + acréscimo%) × (1 − desconto%).", numFmt: "0.00" },
  { titulo: "Forma de Pagamento", largura: 20, obrigatoria: false, formato: "Lista", exemplo: "Pix", obs: "Dinheiro, Crédito, Débito, Bonificação, Pix ou Outros. Vale a da primeira linha de cada pedido." },
  { titulo: "Prazo (dias)", largura: 12, obrigatoria: false, formato: "Inteiro de 1 a 365", exemplo: "30", obs: "Vazio = à vista. Vale o da primeira linha de cada pedido.", numFmt: "0" },
  { titulo: "Observações", largura: 36, obrigatoria: false, formato: "Texto (até 500)", exemplo: "Entregar pela manhã", obs: "Observações do pedido (vale a da primeira linha de cada pedido)." },
];
const FORMAS = ["Dinheiro", "Crédito", "Débito", "Bonificação", "Pix", "Outros"];

const borda = { style: "thin" as const, color: { argb: "FFD9D9D9" } };
const bordas = { top: borda, left: borda, bottom: borda, right: borda };
const data = (d: number, m: number, a: number) => new Date(Date.UTC(a, m - 1, d, 12));

const wb = new ExcelJS.Workbook();
wb.creator = "Plurima";

// --- Aba Pedidos -------------------------------------------------------------------------------
const ws = wb.addWorksheet("Pedidos", { views: [{ state: "frozen", ySplit: 1 }] });
ws.columns = COLUNAS.map((c) => ({ header: c.titulo, key: c.titulo, width: c.largura }));
const cab = ws.getRow(1);
cab.height = 28;
COLUNAS.forEach((c, i) => {
  const cel = cab.getCell(i + 1);
  const fundo = c.titulo === "Número do Pedido" ? "FF2E75B6" : c.obrigatoria ? "FFBF9000" : "FF1F3864";
  cel.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fundo } };
  cel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cel.border = bordas;
});

// 5 exemplos: 2 linhas com o mesmo número (1 pedido); 2 sem número, mesmo cliente e data (1 pedido automático);
// 1 sem número com outra data (outro pedido automático). Número vazio = célula realmente vazia.
const exemplos: (string | number | Date | null)[][] = [
  ["1001", data(20, 10, 2026), "11.222.333/0001-81", "SKU-001", "Camiseta básica", 10, 25.9, 0, 0, "Pix", 30, "Pedido do ERP"],
  ["1001", data(20, 10, 2026), "11.222.333/0001-81", "SKU-002", "Calça jeans", 5, 89.9, 5, 0, null, null, null],
  [null, data(21, 10, 2026), "45.723.174/0001-10", "SKU-001", "Camiseta básica", 3, 25.9, 0, 10, "Crédito", null, null],
  [null, data(21, 10, 2026), "45.723.174/0001-10", "SKU-003", "Jaqueta", 2, 149.9, 10, 0, null, null, null],
  [null, data(22, 10, 2026), "45.723.174/0001-10", "SKU-002", "Calça jeans", 1, 89.9, 0, 0, "Pix", null, null],
];
exemplos.forEach((valores) => {
  const linha = ws.addRow(valores.map((v) => (v === null ? undefined : v)));
  COLUNAS.forEach((c, i) => {
    const cel = linha.getCell(i + 1);
    if (valores[i] === null) cel.value = null; // célula realmente vazia
    if (c.numFmt) cel.numFmt = c.numFmt;
    cel.border = bordas;
  });
});
// formatos e validações nas linhas de preenchimento
const ULTIMA = 1000;
for (let r = 2; r <= ULTIMA; r++) {
  const linha = ws.getRow(r);
  COLUNAS.forEach((c, i) => {
    const cel = linha.getCell(i + 1);
    if (c.numFmt) cel.numFmt = c.numFmt;
    if (["Número do Pedido", "CNPJ/CPF do Cliente", "SKU do Produto"].includes(c.titulo)) cel.numFmt = "@";
    cel.border = bordas;
  });
  linha.getCell(COLUNAS.findIndex((c) => c.titulo === "Forma de Pagamento") + 1).dataValidation = {
    type: "list", allowBlank: true, formulae: [`"${FORMAS.join(",")}"`],
    showErrorMessage: true, errorTitle: "Forma de Pagamento", error: `Use: ${FORMAS.join(", ")}`,
  };
}

// --- Aba Como Funciona -------------------------------------------------------------------------
const como = wb.addWorksheet("Como Funciona");
como.columns = [{ width: 6 }, { width: 110 }];
const passos = [
  "Cada linha da aba Pedidos é um ITEM de pedido (um produto).",
  "Linhas com o mesmo Número do Pedido formam UM pedido (repita o número em cada item).",
  "Número do Pedido vazio: o número é gerado automaticamente (P + dígitos, na sequência dos seus pedidos).",
  "Linhas SEGUIDAS com número vazio, do mesmo cliente e da mesma data são agrupadas em um único pedido; mudou a data ou o cliente, começa outro pedido.",
  "A representada do pedido é identificada pelo SKU dos produtos (todos os itens precisam ser da mesma representada).",
  "O cliente precisa estar cadastrado (busca pelo CNPJ/CPF); cliente não encontrado impede aquela linha e o pedido dela.",
  "Produto (SKU) não encontrado no Catálogo NÃO impede a gravação: o item entra com pendência e o pedido fica marcado em vermelho.",
  "Pendências são resolvidas depois, na página do pedido (Cadastrar produto) ou no Catálogo da representada.",
  "O preço gravado é sempre o da planilha; diferença acima de 10% em relação ao Catálogo só fica sinalizada.",
  "Pedidos sem pendência entram confirmados (comissão lançada); com pendência entram como rascunho até resolver.",
];
como.addRow(["", "Como funciona a importação de pedidos"]).font = { bold: true, size: 13 };
passos.forEach((p, i) => {
  const l = como.addRow([i + 1, p]);
  l.getCell(2).alignment = { wrapText: true, vertical: "top" };
  l.getCell(1).alignment = { horizontal: "center", vertical: "top" };
});

// --- Aba Instruções ----------------------------------------------------------------------------
const ins = wb.addWorksheet("Instruções", { views: [{ state: "frozen", ySplit: 1 }] });
ins.columns = [
  { header: "Campo", width: 22 }, { header: "Obrigatório", width: 12 }, { header: "Formato", width: 34 },
  { header: "Exemplo", width: 20 }, { header: "Observações", width: 70 },
];
ins.getRow(1).eachCell((cel) => {
  cel.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
  cel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cel.border = bordas;
});
ins.getRow(1).height = 22;
for (const c of COLUNAS) {
  const l = ins.addRow([c.titulo, c.obrigatoria ? "Sim" : "Não", c.formato, c.exemplo, c.obs]);
  l.eachCell((cel) => { cel.border = bordas; cel.alignment = { vertical: "top", wrapText: true }; });
}

mkdirSync(dirname(destino), { recursive: true });
await wb.xlsx.writeFile(destino);
console.log("Modelo gerado:", destino);
