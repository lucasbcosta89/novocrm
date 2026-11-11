import * as XLSX from "xlsx";

/**
 * Planilha .xlsx com uma aba (exportações): cabeçalho na linha 1, primeira linha congelada e largura das
 * colunas pelo conteúdo. Números continuam números (somáveis no Excel); textos (CNPJ, CEP) ficam como texto.
 */
export function gerarXlsx(cabecalho: readonly string[], linhas: readonly (readonly unknown[])[], aba = "Dados"): Uint8Array<ArrayBuffer> {
  const valores = linhas.map((l) => l.map((v) => (v == null ? "" : v)));
  const ws = XLSX.utils.aoa_to_sheet([[...cabecalho], ...valores]);
  ws["!cols"] = cabecalho.map((c, i) => ({
    wch: Math.min(60, Math.max(c.length, ...valores.map((l) => String(l[i] ?? "").length)) + 2),
  }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, aba.slice(0, 31));
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
