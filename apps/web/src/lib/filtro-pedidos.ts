import { z } from "zod";

/**
 * Filtros da página Pedidos (vindos da URL): código, cliente e período pela data do pedido. A mesma regra vale
 * para a listagem e para a exportação (XLSX/CSV), então o arquivo exportado é exatamente a visão da tela.
 */

const umValor = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const dataIso = z.preprocess(
  (v) => { const x = umValor(v); return typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x)) ? x : null; },
  z.string().nullable(),
);

export const filtroPedidosSchema = z
  .object({
    q: z.preprocess((v) => String(umValor(v) ?? "").trim().slice(0, 40), z.string()),
    cliente: z.preprocess((v) => umValor(v) || null, z.uuid().nullable().catch(null)),
    de: dataIso,
    ate: dataIso,
  })
  // período invertido (até antes de de): troca as datas em vez de devolver vazio
  .transform((f) => (f.de && f.ate && f.de > f.ate ? { ...f, de: f.ate, ate: f.de } : f));
export type FiltroPedidos = z.infer<typeof filtroPedidosSchema>;

/** Limites do período no fuso de Brasília (a data do pedido é timestamptz): [de 00:00, dia seguinte a "até" 00:00). */
export function limitesPeriodoPedidos(f: Pick<FiltroPedidos, "de" | "ate">): { desde: string | null; antes: string | null } {
  const diaSeguinte = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  return {
    desde: f.de ? `${f.de}T00:00:00-03:00` : null,
    antes: f.ate ? `${diaSeguinte(f.ate)}T00:00:00-03:00` : null,
  };
}

/** Query string dos filtros (omitindo os vazios), com extras (ex.: formato da exportação). */
export function urlPedidos(f: FiltroPedidos, base: string, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.cliente) p.set("cliente", f.cliente);
  if (f.de) p.set("de", f.de);
  if (f.ate) p.set("ate", f.ate);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

export const filtrandoPedidos = (f: FiltroPedidos) => !!(f.q || f.cliente || f.de || f.ate);
