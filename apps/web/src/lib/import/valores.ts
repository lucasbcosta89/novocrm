/** Conversão dos valores das células da planilha de importação (funções puras). */

/**
 * Número a partir de "R$ 1.234,56", "1.234,56", "1234.56", 1234.56 ou vazio (→ null).
 * O separador ("." ou ",") que aparece por último é o decimal; os demais são de milhar.
 */
export function parseNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let t = String(v).replace(/R\$/gi, "").replace(/\s/g, "");
  if (!t) return null;
  const decimal = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  if (decimal >= 0) {
    const inteiro = t.slice(0, decimal).replace(/[.,]/g, "");
    t = `${inteiro}.${t.slice(decimal + 1)}`;
  }
  if (!/^-?\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Percentual a partir de "10%", "10", "0,1" ou 0.1 (planilhas costumam guardar 10% como 0,1).
 * Sem o sinal "%", valor entre 0 e 1 (exclusive) é multiplicado por 100; com "%", o número é usado como está.
 */
export function parsePercentual(v: unknown): number | null {
  const comSinal = typeof v === "string" && v.includes("%");
  const n = parseNumero(typeof v === "string" ? v.replace(/%/g, "") : v);
  if (n == null) return null;
  return !comSinal && n > 0 && n < 1 ? Math.round(n * 100 * 1e6) / 1e6 : n;
}

/** NCM só com dígitos ("6109.10.00" → "61091000"); null se não sobrarem exatamente 8 dígitos. */
export function parseNcm(v: unknown): string | null {
  const digitos = String(v ?? "").replace(/\D/g, "");
  return digitos.length === 8 ? digitos : null;
}
