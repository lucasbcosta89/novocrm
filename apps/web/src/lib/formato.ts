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
 * Comissão efetiva de um produto (Fase 19 — mesma regra de resolverComissao e do banco, resolver_comissao_pct):
 * a da REPRESENTADA prevalece quando definida (> 0); sem ela, a do produto no catálogo (> 0); sem nenhuma, 0%.
 */
export function comissaoEfetiva(produto: number | null | undefined, fixaRepresentada: number | null | undefined) {
  if (fixaRepresentada != null && Number(fixaRepresentada) > 0) return { valor: Number(fixaRepresentada), origem: "representada" as const };
  if (produto != null && Number(produto) > 0) return { valor: Number(produto), origem: "produto" as const };
  return { valor: 0, origem: "nenhuma" as const };
}

const TZ = "America/Sao_Paulo";
const dataHoraFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
const dataFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short" });

export const formatarDataHora = (iso: string) => dataHoraFmt.format(new Date(iso));
export const formatarData = (iso: string) => dataFmt.format(new Date(iso));
/** Data sem hora (AAAA-MM-DD, ex.: data de faturamento) → DD/MM/AAAA, sem conversão de fuso. */
export const formatarDia = (dia: string) => dia.slice(0, 10).split("-").reverse().join("/");

/** Valor para <input type="datetime-local"> no horário de Brasília. */
export function paraInputDataHora(d: Date | string = new Date()): string {
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(d));
  return partes.replace(" ", "T");
}
