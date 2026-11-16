import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { resolverPeriodo } from "@/lib/custos";
import { idSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

/**
 * Fase 22 — devoluções importadas e seus estornos (comissão NEGATIVA em comissoes, tipo 'estorno').
 * Processar/reabrir são funções SQL transacionais (devolução e estorno nunca divergem). RLS; sem service role.
 * Mês do estorno = Data de Processamento (A.2).
 */

export type DevolucaoImportada = {
  id: string; numero: string; status: "pendente" | "processada"; data: string; data_processamento: string | null;
  codigo_pedido_informado: string | null; sku_informado: string | null; descricao_informada: string | null;
  quantidade: number | null; valor_total: number; comissao_estornada: number; percentual_aplicado: number | null; motivo: string; comissao_id: string | null;
  /** preenchida = importada por Excel; vazia = cadastro manual */
  chave_unica: string | null;
  /** devolução manual: quantidade de itens */
  itens_qtd?: number;
  itens?: { quantidade: number }[];
  representada: { id: string; nome: string } | null; cliente: { id: string; nome: string } | null; pedido: { id: string; codigo_pedido: string } | null;
};

const CAMPOS = `id, numero, status, data, data_processamento, codigo_pedido_informado, sku_informado, descricao_informada, quantidade, valor_total,
  comissao_estornada, percentual_aplicado, motivo, comissao_id, chave_unica, representada:representadas(id, nome:razao_social), cliente:clientes(id, nome),
  pedido:pedidos(id, codigo_pedido), itens:devolucao_itens(quantidade)`;

export const filtroDevolucoesSchema = z.object({
  p: z.string().optional().catch(undefined),
  de: z.string().optional().catch(undefined),
  ate: z.string().optional().catch(undefined),
  /** campo do período: processamento (A.2, padrão) ou devolução */
  campo: z.enum(["processamento", "devolucao"]).catch("processamento").default("processamento"),
  /** pendente = sem Data de Processamento; processada = com data */
  st: z.enum(["pendente", "processada"]).optional().catch(undefined),
  /** origem: cadastro manual ou importada por Excel */
  orig: z.enum(["manual", "excel"]).optional().catch(undefined),
  rep: z.preprocess((v) => (v == null || v === "" ? [] : Array.isArray(v) ? v : String(v).split(",")), z.array(z.string().uuid()).catch([])),
});

const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const cent = (v: number) => Math.round(v * 100) / 100;
const um = (v: unknown) => (Array.isArray(v) ? v[0] : v);

export type ResultadoDevolucoes = {
  linhas: DevolucaoImportada[];
  periodo: { de: string; ate: string; rotulo: string };
  totais: { quantidade: number; valor_total: number; comissao_estornada: number; pendentes: number; processadas: number };
  porRepresentada: { id: string; nome: string; quantidade: number; valor_total: number; comissao_estornada: number }[];
};

/**
 * H.4 — relatório de devoluções: lista própria + totais do período e por representada. Pendentes (sem Data de
 * Processamento) entram pelo período da Data da Devolução quando o campo é "processamento".
 */
export async function listarDevolucoesImportadas({ supabase }: Contexto, entrada: Record<string, unknown>): Promise<ResultadoDevolucoes> {
  const f = filtroDevolucoesSchema.parse(Object.fromEntries(Object.entries(entrada).map(([k, v]) => [k, k === "rep" ? v : um(v)])));
  const periodo = resolverPeriodo(f.p ?? "este_mes", f.de, f.ate, hojeSP());
  // todas as devoluções com estorno de comissão (manuais e importadas); recusadas ficam de fora
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- filtros encadeados estouram a inferência de tipos do supabase-js
  let q: any = supabase.from("devolucoes").select(CAMPOS).not("comissao_id", "is", null).neq("status", "recusada");
  if (f.st === "pendente") q = q.is("data_processamento", null);
  if (f.st === "processada") q = q.not("data_processamento", "is", null);
  if (f.orig === "manual") q = q.is("chave_unica", null);
  if (f.orig === "excel") q = q.not("chave_unica", "is", null);
  if (f.rep.length) q = q.in("representada_id", f.rep);
  q = f.campo === "devolucao"
    ? q.gte("data", periodo.de).lte("data", periodo.ate)
    : q.or(`and(data_processamento.gte.${periodo.de},data_processamento.lte.${periodo.ate}),and(data_processamento.is.null,data.gte.${periodo.de},data.lte.${periodo.ate})`);
  const { data, error } = await q.order("data", { ascending: false }).limit(10_000) as { data: DevolucaoImportada[] | null; error: PostgrestError | null };
  if (error) throw erroBanco(error);
  const linhas = (data ?? []).map((d) => ({
    ...d, valor_total: Number(d.valor_total), comissao_estornada: Number(d.comissao_estornada), itens_qtd: d.itens?.length ?? 0,
    quantidade: d.chave_unica ? Number(d.quantidade) : (d.itens ?? []).reduce((t, i) => t + Number(i.quantidade), 0),
  }));
  const porRep = new Map<string, ResultadoDevolucoes["porRepresentada"][number]>();
  for (const d of linhas) {
    const k = d.representada?.id ?? "—";
    const r = porRep.get(k) ?? { id: k, nome: d.representada?.nome ?? "—", quantidade: 0, valor_total: 0, comissao_estornada: 0 };
    r.quantidade++; r.valor_total = cent(r.valor_total + d.valor_total); r.comissao_estornada = cent(r.comissao_estornada + d.comissao_estornada);
    porRep.set(k, r);
  }
  return {
    linhas, periodo,
    totais: {
      quantidade: linhas.length, valor_total: cent(linhas.reduce((t, d) => t + d.valor_total, 0)), comissao_estornada: cent(linhas.reduce((t, d) => t + d.comissao_estornada, 0)),
      pendentes: linhas.filter((d) => !d.data_processamento).length, processadas: linhas.filter((d) => !!d.data_processamento).length,
    },
    porRepresentada: [...porRep.values()].sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de Processamento inválida (use AAAA-MM-DD)")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "Data de Processamento inválida");

/** G.1–G.4: marcar como processada (individual ou lote). Data vazia = usa a já informada na devolução. */
export async function processarDevolucoes({ supabase }: Contexto, ids: unknown, data: unknown): Promise<{ quantidade: number; valor_estornado: number }> {
  const lista = z.array(idSchema).min(1, "Selecione ao menos uma devolução").parse(ids);
  if (lista.length > 2000) throw new AppError(400, "Seleção acima de 2.000 devoluções: refine o filtro", "limite_lote");
  const d = data == null || data === "" ? null : dataSchema.parse(data);
  const { data: r, error } = await supabase.rpc("processar_devolucoes", { p_ids: lista, p_data: d });
  if (error) throw erroBanco(error);
  return r as { quantidade: number; valor_estornado: number };
}

/** G.5: reabrir devolução (estorno volta a 'prevista'; nunca é apagado). */
export async function reabrirDevolucao({ supabase }: Contexto, id: string, limparData: boolean): Promise<void> {
  const { error } = await supabase.rpc("reabrir_devolucao", { p_id: idSchema.parse(id), p_limpar_data: z.boolean().parse(limparData) });
  if (error) throw erroBanco(error);
}

/** Resumo para a confirmação do processamento (G.2): quantidade, valor a estornar e datas já informadas. */
export async function resumoProcessamento({ supabase }: Contexto, ids: unknown) {
  const lista = z.array(idSchema).min(1).max(2001).parse(ids);
  let valor = 0, semData = 0, invalidas = 0;
  const datas = new Set<string>();
  for (let i = 0; i < lista.length; i += 500) {
    const { data, error } = await supabase.from("devolucoes").select("comissao_estornada, data_processamento, status, comissao_id").in("id", lista.slice(i, i + 500))
      .returns<{ comissao_estornada: number; data_processamento: string | null; status: string; comissao_id: string | null }[]>();
    if (error) throw erroBanco(error);
    for (const d of data) {
      valor += Number(d.comissao_estornada);
      if (d.status !== "pendente" || !d.comissao_id) invalidas++;
      if (d.data_processamento) datas.add(d.data_processamento); else semData++;
    }
  }
  return { quantidade: lista.length, valor: cent(valor), semData, datas: [...datas], invalidas };
}
