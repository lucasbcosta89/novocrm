// Gera public/templates/modelo-devolucoes.xlsx (modelo da importação de devoluções, Fase 22).
// O cabeçalho é contrato: precisa bater com COLUNAS_DEVOLUCAO de src/lib/import/devolucoes.ts (o " *" das
// obrigatórias é aceito pela importação). Mesma identidade visual dos modelos das Fases 17 e 20.
// Rodar: node --experimental-strip-types scripts/gerar-modelo-devolucoes.ts
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const aqui = dirname(fileURLToPath(import.meta.url));
const destino = resolve(aqui, "../public/templates/modelo-devolucoes.xlsx");

type Coluna = { titulo: string; largura: number; obrigatoria: boolean; formato: string; obs: string; numFmt?: string };
const COLUNAS: Coluna[] = [
  { titulo: "Código do Pedido", largura: 18, obrigatoria: true, formato: "Texto (até 40)", obs: "Código do pedido já lançado na plataforma (P000123 ou o código do ERP). Pedido não encontrado = linha rejeitada." },
  { titulo: "SKU", largura: 16, obrigatoria: true, formato: "Texto (até 60)", obs: "SKU do item devolvido, como está no pedido original." },
  { titulo: "Descrição", largura: 30, obrigatoria: false, formato: "Texto (até 200)", obs: "Opcional, só para conferência." },
  { titulo: "Quantidade Devolvida", largura: 14, obrigatoria: true, formato: "Número > 0", obs: "A soma das devoluções do item não pode passar da quantidade vendida.", numFmt: "#,##0.###" },
  { titulo: "Valor Unitário", largura: 15, obrigatoria: false, formato: "R$ #.##0,00", obs: "Opcional. Valor Total vazio = Quantidade × Valor Unitário; os dois vazios = valor unitário do item no pedido original.", numFmt: '"R$" #,##0.00' },
  { titulo: "Valor Total", largura: 15, obrigatoria: false, formato: "R$ #.##0,00", obs: "Opcional (ver Valor Unitário).", numFmt: '"R$" #,##0.00' },
  { titulo: "Comissão a Estornar (R$)", largura: 18, obrigatoria: false, formato: "R$ #.##0,00 (opcional)", obs: "Vazia ou zerada: calculada pelo percentual gravado no item do pedido original (Valor Total × %). Nunca passa da comissão original do item (acima disso é limitada ao saldo).", numFmt: '"R$" #,##0.00' },
  { titulo: "Data da Devolução", largura: 16, obrigatoria: true, formato: "DD/MM/AAAA", obs: "Data em que o cliente devolveu.", numFmt: "dd/mm/yyyy" },
  { titulo: "Data de Processamento", largura: 18, obrigatoria: false, formato: "DD/MM/AAAA (opcional)", obs: "Data em que a representada processou a devolução. Preenchida: o estorno já entra como recebido nessa data (mês do estorno). Vazia: fica pendente até “Marcar como processada”.", numFmt: "dd/mm/yyyy" },
  { titulo: "Motivo", largura: 16, obrigatoria: false, formato: "Lista", obs: "Defeito, Desistência, Erro no pedido ou Outro (vazio = Outro)." },
  { titulo: "Observações", largura: 36, obrigatoria: false, formato: "Texto (até 500)", obs: "Opcional." },
];
const MOTIVOS = ["Defeito", "Desistência", "Erro no pedido", "Outro"];

const borda = { style: "thin" as const, color: { argb: "FFD9D9D9" } };
const bordas = { top: borda, left: borda, bottom: borda, right: borda };
const data = (d: number, m: number, a: number) => new Date(Date.UTC(a, m - 1, d, 12));
const rotulo = (c: Coluna) => (c.obrigatoria ? `${c.titulo} *` : c.titulo);

const wb = new ExcelJS.Workbook();
wb.creator = "Plurima";

function cabecalho(ws: ExcelJS.Worksheet) {
  ws.columns = COLUNAS.map((c) => ({ header: rotulo(c), key: c.titulo, width: c.largura }));
  const cab = ws.getRow(1);
  cab.height = 30;
  COLUNAS.forEach((c, i) => {
    const cel = cab.getCell(i + 1);
    cel.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.obrigatoria ? "FFBF9000" : "FF1F3864" } };
    cel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cel.border = bordas;
    if (c.obrigatoria) cel.note = "Obrigatória";
  });
}
function formatarLinha(linha: ExcelJS.Row) {
  COLUNAS.forEach((c, i) => {
    const cel = linha.getCell(i + 1);
    if (c.numFmt) cel.numFmt = c.numFmt;
    if (["Código do Pedido", "SKU"].includes(c.titulo)) cel.numFmt = "@";
    cel.border = bordas;
  });
  linha.getCell(COLUNAS.findIndex((c) => c.titulo === "Motivo") + 1).dataValidation = {
    type: "list", allowBlank: true, formulae: [`"${MOTIVOS.join(",")}"`], showErrorMessage: true, errorTitle: "Motivo", error: `Use: ${MOTIVOS.join(", ")}`,
  };
}

// --- Aba Devoluções (a importada: primeira aba) ------------------------------------------------
const ws = wb.addWorksheet("Devoluções", { views: [{ state: "frozen", ySplit: 1 }] });
cabecalho(ws);
for (let r = 2; r <= 1000; r++) formatarLinha(ws.getRow(r));

// --- Aba Instruções ----------------------------------------------------------------------------
const ins = wb.addWorksheet("Instruções", { views: [{ state: "frozen", ySplit: 1 }] });
ins.columns = [{ header: "Nome", width: 26 }, { header: "Obrigatório", width: 12 }, { header: "Formato", width: 26 }, { header: "Observações", width: 90 }];
ins.getRow(1).eachCell((cel) => {
  cel.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
  cel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cel.border = bordas;
});
ins.getRow(1).height = 22;
for (const c of COLUNAS) {
  const l = ins.addRow([c.titulo, c.obrigatoria ? "Sim" : "Não", c.formato, c.obs]);
  l.eachCell((cel) => { cel.border = bordas; cel.alignment = { vertical: "top", wrapText: true }; });
}
ins.addRow([]);
for (const nota of [
  "Colunas com * (fundo amarelo) são obrigatórias.",
  "Células de comissão vazias ou zeradas são calculadas pelo pedido original (percentual gravado no item).",
  "Planilhas com fórmula devem ser salvas no Excel antes do envio (a importação usa o valor calculado da célula, nunca a fórmula).",
  "Cada devolução gera uma comissão NEGATIVA (estorno) separada; a comissão original do pedido nunca é alterada.",
  "Reenviar a mesma planilha não duplica nada: as linhas já importadas aparecem como duplicadas.",
]) {
  const l = ins.addRow([nota]);
  ins.mergeCells(`A${l.number}:D${l.number}`);
  l.getCell(1).alignment = { wrapText: true, vertical: "top" };
}

// --- Aba Exemplos (valores fixos, sem fórmula) --------------------------------------------------
const ex = wb.addWorksheet("Exemplos", { views: [{ state: "frozen", ySplit: 1 }] });
cabecalho(ex);
ex.columns = [...COLUNAS.map((c) => ({ header: rotulo(c), key: c.titulo, width: c.largura })), { header: "Caso", key: "caso", width: 34 }];
const exemplos: (string | number | Date | null)[][] = [
  ["P000101", "SKU-001", "Camiseta básica", 10, 25.9, 259, 12.95, data(5, 11, 2026), null, "Defeito", "Lote com defeito", "Devolução completa (10 de 10)"],
  ["P000102", "SKU-002", "Calça jeans", 1, 89.9, 89.9, 4.5, data(6, 11, 2026), null, "Desistência", null, "Devolução parcial (1 de 5)"],
  ["P000103", "SKU-003", "Jaqueta", 2, 149.9, null, 14.99, data(7, 11, 2026), null, "Outro", null, "Valor total omitido (qtd × unitário)"],
  ["P000104", "SKU-001", "Camiseta básica", 3, 25.9, 77.7, null, data(8, 11, 2026), null, "Erro no pedido", null, "Comissão omitida (calculada pelo pedido)"],
  ["P000105", "SKU-002", "Calça jeans", 2, 89.9, 179.8, 8.99, data(9, 11, 2026), data(15, 11, 2026), "Defeito", null, "Data de processamento preenchida"],
];
exemplos.forEach((valores) => {
  const l = ex.addRow(valores.map((v) => (v === null ? undefined : v)));
  formatarLinha(l);
  valores.forEach((v, i) => { if (v === null) l.getCell(i + 1).value = null; });
  l.getCell(COLUNAS.length + 1).font = { italic: true, color: { argb: "FF595959" } };
});
const casoCab = ex.getRow(1).getCell(COLUNAS.length + 1);
casoCab.font = { bold: true, color: { argb: "FFFFFFFF" } };
casoCab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF595959" } };
casoCab.alignment = { horizontal: "center", vertical: "middle" };

mkdirSync(dirname(destino), { recursive: true });
await wb.xlsx.writeFile(destino);
console.log("Modelo gerado:", destino);
