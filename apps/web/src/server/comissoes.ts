import { idSchema, marcarComissaoSchema, STATUS_COMISSAO } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

export type Comissao = {
  id: string;
  representada_id: string;
  percentual: number;
  valor: number;
  status: (typeof STATUS_COMISSAO)[number];
  data_prevista: string | null;
  recebida_em: string | null;
  representada: { id: string; nome: string } | null;
  pedido: { id: string; numero: string; valor_total: number; cliente: { id: string; nome: string } | null } | null;
};

export type TotaisComissao = { a_receber: number; recebida: number; atrasada: number };
export type ResumoComissoes = { representada: { id: string; nome: string }; totais: TotaisComissao; quantidade: number }[];

const CAMPOS = `id, representada_id, percentual, valor, status, data_prevista, recebida_em,
  representada:representadas(id, nome),
  pedido:pedidos(id, numero, valor_total, cliente:clientes(id, nome))`;

export async function listarComissoes(
  { supabase }: Contexto,
  filtro: { representada_id?: string; status?: string } = {},
): Promise<Comissao[]> {
  let q = supabase.from("comissoes").select(CAMPOS);
  if (filtro.representada_id) q = q.eq("representada_id", idSchema.parse(filtro.representada_id));
  if (filtro.status && (STATUS_COMISSAO as readonly string[]).includes(filtro.status)) q = q.eq("status", filtro.status);
  const { data, error } = await q.order("data_prevista", { ascending: true }).returns<Comissao[]>();
  if (error) throw erroBanco(error);
  return data;
}

const arred = (v: number) => Math.round(v * 100) / 100;

/** Totais por representada (canceladas ficam de fora). */
export function resumirComissoes(comissoes: Comissao[]): ResumoComissoes {
  const mapa = new Map<string, ResumoComissoes[number]>();
  for (const c of comissoes) {
    if (c.status === "cancelada" || !c.representada) continue;
    const item = mapa.get(c.representada_id) ?? {
      representada: c.representada,
      totais: { a_receber: 0, recebida: 0, atrasada: 0 },
      quantidade: 0,
    };
    item.totais[c.status] = arred(item.totais[c.status] + Number(c.valor));
    item.quantidade++;
    mapa.set(c.representada_id, item);
  }
  return [...mapa.values()].sort((a, b) => a.representada.nome.localeCompare(b.representada.nome));
}

export async function marcarComissao({ supabase }: Contexto, id: string, input: unknown): Promise<void> {
  const { status } = marcarComissaoSchema.parse(input);
  const { error, count } = await supabase
    .from("comissoes")
    .update({ status, recebida_em: status === "recebida" ? new Date().toISOString() : null }, { count: "exact" })
    .eq("id", idSchema.parse(id))
    .neq("status", "cancelada");
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Comissão não encontrada ou cancelada", "nao_encontrado");
}
