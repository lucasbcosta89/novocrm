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
  // célula numérica do Excel perde o zero à esquerda (01012100 → 1012100): completa até 8 dígitos
  const digitos = typeof v === "number" && Number.isInteger(v) && v >= 1_000_000 && v < 10_000_000
    ? String(v).padStart(8, "0")
    : String(v ?? "").replace(/\D/g, "");
  return digitos.length === 8 ? digitos : null;
}

/**
 * Data da planilha → "AAAA-MM-DD" (ou null se inválida). Aceita DD/MM/AAAA (ou DD-MM-AAAA, DD.MM.AAAA),
 * AAAA-MM-DD e o número de série do Excel (célula formatada como data chega como número de dias desde 1899-12-30).
 */
export function parseData(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  let a: number, m: number, d: number;
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (br) [d, m, a] = [Number(br[1]), Number(br[2]), Number(br[3])];
  else if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (/^\d{4,5}(\.\d+)?$/.test(t) && Number(t) > 1 && Number(t) < 80000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000);
    [a, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  } else return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (a < 1900 || a > 2100 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
