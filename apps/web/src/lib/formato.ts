export function formatarDocumento(doc: string | null): string {
  if (!doc) return "—";
  if (doc.length === 14) return doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (doc.length === 11) return doc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return doc;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatarMoeda = (v: number) => brl.format(v);
export const formatarPercentual = (v: number) => `${String(v).replace(".", ",")}%`;

/**
 * Comissão efetiva de um produto: a do produto prevalece; sem ela, a comissão fixa da representada; sem
 * nenhuma, 0% (mesma regra do banco, trigger pedido_itens_comissao_efetiva).
 */
export function comissaoEfetiva(produto: number | null | undefined, fixaRepresentada: number | null | undefined) {
  if (produto != null) return { valor: Number(produto), origem: "produto" as const };
  if (fixaRepresentada != null) return { valor: Number(fixaRepresentada), origem: "representada" as const };
  return { valor: 0, origem: "nenhuma" as const };
}

const TZ = "America/Sao_Paulo";
const dataHoraFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
const dataFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short" });

export const formatarDataHora = (iso: string) => dataHoraFmt.format(new Date(iso));
export const formatarData = (iso: string) => dataFmt.format(new Date(iso));

/** Valor para <input type="datetime-local"> no horário de Brasília. */
export function paraInputDataHora(d: Date | string = new Date()): string {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(d));
  return partes.replace(" ", "T");
}
