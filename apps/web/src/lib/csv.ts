/**
 * CSV para Excel em português: separador ";", BOM UTF-8 (acentuação correta) e quebra CRLF.
 * Número sai com vírgula decimal; célula com ; " ou quebra de linha vai entre aspas.
 */
export function celulaCsv(v: unknown): string {
  const s = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function gerarCsv(cabecalho: readonly string[], linhas: readonly (readonly unknown[])[]): string {
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(";")).join("\r\n");
}
