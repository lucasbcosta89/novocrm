import type { ConfiguracaoImportacao, RelatorioImportacao } from "@/lib/cadastros/tipos";
import { gerarCsv } from "@/lib/csv";
import { MAX_LINHAS, type LinhaBruta } from "./motor";

/** Arquivos da importação genérica: leitura (.xlsx/.csv), modelo para download e relatório de erros (CSV). */

export const EXTENSOES_IMPORTACAO = /\.(xlsx|csv)$/i;
export const LIMITE_BYTES_IMPORTACAO = 10 * 1024 * 1024;

/** Célula → texto: número inteiro sem notação científica; vazio → "". */
function textoCelula(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** CSV vindo do Excel em português costuma ser Windows-1252: tenta UTF-8 estrito e cai para 1252. */
function decodificarCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Lê a primeira aba (xlsx) ou o CSV (";" ou ","). Linha 1 = cabeçalho; linhas totalmente vazias são puladas,
 * mas o número de cada linha é o número real na planilha. Acima de 5.000 linhas: recusa com mensagem clara.
 */
export async function lerPlanilha(arquivo: File, maxLinhas = MAX_LINHAS): Promise<{ cabecalho: string[]; linhas: LinhaBruta[] }> {
  if (!EXTENSOES_IMPORTACAO.test(arquivo.name)) throw new Error("Envie um arquivo .xlsx ou .csv.");
  if (arquivo.size > LIMITE_BYTES_IMPORTACAO) throw new Error("Arquivo acima de 10 MB.");
  const XLSX = await import("xlsx");
  const bytes = await arquivo.arrayBuffer();
  let wb;
  if (/\.csv$/i.test(arquivo.name)) {
    const texto = decodificarCsv(bytes);
    const primeira = texto.split(/\r?\n/, 1)[0] ?? "";
    const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
    wb = XLSX.read(texto, { type: "string", FS: sep, raw: true });
  } else {
    wb = XLSX.read(bytes, { type: "array" });
  }
  const aba = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!aba) throw new Error("A planilha está vazia.");
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, raw: true, defval: "", blankrows: true });
  const cabecalho = (matriz[0] ?? []).map(textoCelula);
  while (cabecalho.length && !cabecalho[cabecalho.length - 1]) cabecalho.pop(); // colunas vazias à direita
  const linhas: LinhaBruta[] = [];
  matriz.slice(1).forEach((celulas, i) => {
    const valores = celulas.map(textoCelula);
    if (valores.some((v) => v !== "")) linhas.push({ numero_linha: i + 2, valores });
  });
  if (linhas.length === 0) throw new Error("A planilha não tem linhas preenchidas (comece na linha 2, abaixo do cabeçalho).");
  if (linhas.length > maxLinhas) {
    throw new Error(`A planilha tem ${linhas.length.toLocaleString("pt-BR")} linhas; o limite é ${maxLinhas.toLocaleString("pt-BR")} por importação. Divida o arquivo e importe em partes.`);
  }
  return { cabecalho, linhas };
}

/** Dispara o download de um conteúdo no navegador. */
export function baixarArquivo(conteudo: BlobPart, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Arquivo modelo: cabeçalho exato + uma linha de exemplo (sem dados reais); no .xlsx, aba de instruções. */
export async function baixarModelo<T>(config: ConfiguracaoImportacao<T>, formato: "xlsx" | "csv") {
  const exemplo = config.colunasEsperadas.map((c) => config.linhaExemplo[c] ?? "");
  const nome = `modelo-${config.entidade}`;
  if (formato === "csv") return baixarArquivo(gerarCsv(config.colunasEsperadas, [exemplo]), `${nome}.csv`, "text/csv;charset=utf-8");
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const aba = XLSX.utils.aoa_to_sheet([config.colunasEsperadas, exemplo]);
  aba["!cols"] = config.colunasEsperadas.map((c) => ({ wch: Math.max(c.length, (config.linhaExemplo[c] ?? "").length) + 2 }));
  XLSX.utils.book_append_sheet(wb, aba, config.entidade);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Instruções"], [config.mensagemModelo]]), "Instruções");
  XLSX.writeFile(wb, `${nome}.xlsx`);
}

/** Relatório de problemas (CSV): uma linha por problema — número da linha, classificação, campo, mensagem, valor. */
export function relatorioErrosCsv(rel: Pick<RelatorioImportacao, "linhas">, incluirAlertas = true): string {
  const rotulo = { valida: "Válida", com_alerta: "Com alerta", invalida: "Inválida" } as const;
  const linhas = rel.linhas.flatMap((l) => [
    ...l.erros.map((p) => [l.numero_linha, rotulo[l.classificacao], "Erro", p.campo, p.mensagem, p.valor_recebido ?? ""]),
    ...(incluirAlertas ? l.alertas.map((p) => [l.numero_linha, rotulo[l.classificacao], "Alerta", p.campo, p.mensagem, p.valor_recebido ?? ""]) : []),
  ]);
  return gerarCsv(["Linha", "Classificação", "Tipo", "Campo", "Mensagem", "Valor recebido"], linhas);
}

/**
 * Linhas que NÃO entraram (inválidas), no formato exato do modelo (mesmo cabeçalho e ordem), com os valores
 * como vieram no arquivo — para corrigir e reenviar. Reenviar o arquivo inteiro também é seguro: o que já
 * entrou igual é ignorado (dedupe pela chave), sem duplicar.
 */
export function linhasComErroCsv<T>(config: ConfiguracaoImportacao<T>, brutas: readonly LinhaBruta[], rel: Pick<RelatorioImportacao, "linhas">): string {
  const comErro = new Set(rel.linhas.filter((l) => l.classificacao === "invalida").map((l) => l.numero_linha));
  const n = config.colunasEsperadas.length;
  const linhas = brutas.filter((b) => comErro.has(b.numero_linha)).map((b) => Array.from({ length: n }, (_, i) => b.valores[i] ?? ""));
  return gerarCsv(config.colunasEsperadas, linhas);
}
