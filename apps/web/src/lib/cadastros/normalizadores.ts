import { cnpjValido } from "@/lib/documentos-br";
import { parseNumero } from "@/lib/import/valores";
import { SIGLAS_UF } from "@/lib/ufs";
import { soDigitos as digitosDoTexto } from "@/lib/validacao";

/**
 * Normalizadores dos cadastros (formulário e importação usam os mesmos): devolvem o valor como é gravado
 * no banco, ou null quando vazio. Funções puras.
 */

const texto = (v: unknown) => (v == null ? "" : String(v).trim());
export const soDigitos = (v: unknown) => digitosDoTexto(texto(v));

/** CNPJ sem máscara (só dígitos). */
export const normalizarCnpj = (v: unknown) => soDigitos(v) || null;
export { cnpjValido };

/** Telefone só com dígitos; DDI 55 removido quando sobra DDD + número (10 ou 11 dígitos). */
export function normalizarTelefone(v: unknown): string | null {
  const d = soDigitos(v);
  if (!d) return null;
  return d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
}

export const telefoneValido = (d: string) => /^[0-9]{10,11}$/.test(d);

/** UF em maiúsculas; null se vazia. */
export const normalizarUf = (v: unknown) => texto(v).toUpperCase() || null;
export const ufValida = (uf: string) => SIGLAS_UF.includes(uf);

/** E-mail aparado e em minúsculas. */
export const normalizarEmail = (v: unknown) => texto(v).toLowerCase() || null;
export const emailValido = (e: string) => e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/** Inscrição estadual: "ISENTO" (qualquer caixa) ou só dígitos. */
export function normalizarInscricaoEstadual(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  return /^isento$/i.test(t) ? "ISENTO" : t.replace(/[.\-/\s]/g, "");
}
export const inscricaoEstadualValida = (ie: string) => /^([0-9]{2,14}|ISENTO)$/.test(ie);

/** Decimal com vírgula ou ponto ("7,5", "1.234,56", "7.5"); NaN quando não é número; null quando vazio. */
export function normalizarDecimal(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (!texto(v)) return null;
  return parseNumero(texto(v).replace(/%$/, "")) ?? Number.NaN;
}

/** CEP só com dígitos. */
export const normalizarCep = (v: unknown) => soDigitos(v) || null;
