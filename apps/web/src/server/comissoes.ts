import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { type FiltroComissoes, lerFiltroComissoes, periodoDoFiltro, POR_PAGINA } from "@/lib/comissoes/filtro";
import {
  GROUP_EM_ANALISE, GRUPOS_STATUS, selecionavelEmLote, statusDosGrupos, statusNoGrupo, type GrupoStatus, type MotivoPendencia,
  rotuloStatus, type OrigemCalculo, type StatusComissao,
} from "@/lib/comissoes/status";
import { idSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

/**
 * Fase 21 — página de Comissões, fila de análise, aprovação/reabertura em lote, edição de data e histórico.
 * Status sempre via lib/comissoes/status.ts (nada de status escrito à mão). RLS por user_id; nenhuma service role.
 */

export type ItemResumo = { descricao: string | null; descricao_informada: string | null; produto: { nome: string; sku: string } | null };
export type Comissao = {
  id: string;
  representada_id: string;
  percentual: number;
  valor: number;
  status: StatusComissao;
  completude: "completa" | "incompleta";
  motivos_pendencia: MotivoPendencia[];
  origem_calculo: OrigemCalculo | null;
  data_prevista_recebimento: string | null;
  data_recebimento: string | null;
  liquidada_automaticamente: boolean;
  data_recebimento_editada: boolean;
  lote_aprovacao_id: string | null;
  aprovada_em: string | null;
  reaberta_em: string | null;
  representada: { id: string; nome: string } | null;
  pedido: {
    id: string; codigo_pedido: string; data: string; data_faturamento: string | null; valor_total: number; origem: string;
    cliente: { id: string; nome: string } | null; itens: ItemResumo[];
  } | null;
};

const CAMPOS = `id, representada_id, percentual, valor, status, completude, motivos_pendencia, origem_calculo, data_prevista_recebimento, data_recebimento,
  liquidada_automaticamente, data_recebimento_editada, lote_aprovacao_id, aprovada_em, reaberta_em,
  representada:representadas(id, nome:razao_social),
  pedido:pedidos!inner(id, codigo_pedido, data, data_faturamento, valor_total, origem, cliente_id, cliente:clientes(id, nome),
    itens:pedido_itens(descricao, descricao_informada, produto:produtos(nome, sku)))`;

/** Produto do lançamento: nome do produto ou, sem produto, a descrição informada (N.6 — nunca célula vazia). */
export function produtoDaComissao(c: Pick<Comissao, "pedido">): string {
  const itens = c.pedido?.itens ?? [];
  if (!itens.length) return "—";
  const nome = (i: ItemResumo) => i.produto?.nome ?? i.descricao_informada ?? i.descricao ?? "Item sem descrição";
  return itens.length === 1 ? nome(itens[0]!) : `${nome(itens[0]!)} + ${itens.length - 1} item(ns)`;
}

const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const LIMITE = 10_000;

type Opcoes = { ignorarGrupo?: boolean; somenteGrupos?: readonly GrupoStatus[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aplicarFiltro(q: any, f: FiltroComissoes, op: Opcoes = {}) {
  const grupos = op.somenteGrupos ?? (f.visao === "analise" ? (["em_analise"] as GrupoStatus[]) : op.ignorarGrupo ? [] : f.g);
  if (grupos.length) q = q.in("status", statusDosGrupos(grupos));
  if (f.comp) q = q.eq("completude", f.comp);
  if (f.mot) q = q.contains("motivos_pendencia", [f.mot]);
  if (f.rep.length) q = q.in("representada_id", f.rep);
  if (f.cli.length) q = q.in("pedido.cliente_id", f.cli);
  if (f.lote) q = q.not("lote_aprovacao_id", "is", null);
  if (f.ed) q = q.eq("data_recebimento_editada", true);
  if (f.campo === "sem_previsao") return q.is("data_prevista_recebimento", null);
  const { de, ate } = periodoDoFiltro(f, hojeSP());
  switch (f.campo) {
    case "recebimento": return q.gte("data_recebimento", de).lte("data_recebimento", ate);
    case "faturamento": return q.gte("pedido.data_faturamento", de).lte("pedido.data_faturamento", ate);
    case "pedido": return q.gte("pedido.data", `${de}T00:00:00-03:00`).lte("pedido.data", `${ate}T23:59:59.999-03:00`);
    default: return q.gte("data_prevista_recebimento", de).lte("data_prevista_recebimento", ate);
  }
}

export type Totais = Record<GrupoStatus, { valor: number; quantidade: number }>;
const arred = (v: number) => Math.round(v * 100) / 100;

export function totalizar(comissoes: { status: string; valor: number }[]): Totais {
  const t = Object.fromEntries(GRUPOS_STATUS.map((g) => [g, { valor: 0, quantidade: 0 }])) as Totais;
  for (const c of comissoes) {
    const g = statusNoGrupo(c.status);
    if (g === "desconhecido") continue; // cancelada fica fora de todos os totais
    t[g].valor = arred(t[g].valor + Number(c.valor));
    t[g].quantidade++;
  }
  return t;
}

export type ResultadoComissoes = {
  filtro: FiltroComissoes;
  periodo: { de: string; ate: string; rotulo: string };
  linhas: Comissao[];
  total: number;
  pagina: number;
  paginas: number;
  totais: Totais;
  /** ids selecionáveis em lote de TODO o filtro (I.1 "Selecionar todos os N do filtro atual") */
  selecionaveis: string[];
  /** N.3: comissões em análise fora do filtro de grupo atual */
  emAnaliseFora: number;
  limitado: boolean;
};

function ordenar(linhas: Comissao[], f: FiltroComissoes): Comissao[] {
  const s = f.dir === "asc" ? 1 : -1;
  const chave = (c: Comissao): string | number =>
    f.ord === "valor" ? Number(c.valor) : f.ord === "pedido" ? c.pedido?.data ?? "" : c.data_prevista_recebimento ?? "9999";
  return [...linhas].sort((a, b) => { const x = chave(a), y = chave(b); return (x < y ? -1 : x > y ? 1 : a.id.localeCompare(b.id)) * s; });
}

/** Lista + totais do filtro INTEIRO (P.2), paginada em memória (até 10.000 lançamentos por filtro). */
export async function listarComissoes(ctx: Contexto, entrada: unknown): Promise<ResultadoComissoes> {
  const f = lerFiltroComissoes((entrada ?? {}) as Record<string, unknown>);
  const periodo = periodoDoFiltro(f, hojeSP());
  const { data, error } = await aplicarFiltro(ctx.supabase.from("comissoes").select(CAMPOS), f).limit(LIMITE) as { data: Comissao[] | null; error: PostgrestError | null };
  if (error) throw erroBanco(error);
  const todas = ordenar((data as Comissao[]).map((c) => ({ ...c, valor: Number(c.valor), percentual: Number(c.percentual) })), f);
  const paginas = Math.max(1, Math.ceil(todas.length / POR_PAGINA));
  const pagina = Math.min(f.pag, paginas);
  let emAnaliseFora = 0;
  if (f.visao === "lista" && f.g.length && !f.g.includes("em_analise")) {
    const { count, error: e2 } = await aplicarFiltro(ctx.supabase.from("comissoes").select("id, pedido:pedidos!inner(id)", { count: "exact", head: true }), f, { somenteGrupos: ["em_analise"] });
    if (e2) throw erroBanco(e2);
    emAnaliseFora = count ?? 0;
  }
  return {
    filtro: f, periodo, linhas: todas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA), total: todas.length, pagina, paginas,
    totais: totalizar(todas), selecionaveis: todas.filter((c) => selecionavelEmLote(c.status)).map((c) => c.id), emAnaliseFora,
    limitado: todas.length >= LIMITE,
  };
}

/** Linhas completas do filtro para exportação (N.5). */
export async function comissoesParaExportar(ctx: Contexto, entrada: unknown): Promise<Comissao[]> {
  const f = lerFiltroComissoes((entrada ?? {}) as Record<string, unknown>);
  const { data, error } = await aplicarFiltro(ctx.supabase.from("comissoes").select(CAMPOS), f).limit(LIMITE) as { data: Comissao[] | null; error: PostgrestError | null };
  if (error) throw erroBanco(error);
  return ordenar(data as Comissao[], f);
}

/** O — aviso agregado: UM por usuário, todos os motivos juntos. */
export async function pendentesDeAnalise({ supabase }: Contexto): Promise<{ quantidade: number; valor: number }> {
  const { data, error } = await supabase.from("comissoes").select("valor").in("status", [...GROUP_EM_ANALISE]).limit(LIMITE).returns<{ valor: number }[]>();
  if (error) throw erroBanco(error);
  return { quantidade: data.length, valor: arred(data.reduce((t, c) => t + Number(c.valor), 0)) };
}

/* ---------- Histórico (L.4) e lotes (J.1) ---------- */

export type EventoHistorico = { comissao_id: string; campo: string; valor_anterior: string | null; valor_novo: string | null; autor: string | null; motivo: string | null; criado_em: string };

export async function historicoDasComissoes({ supabase }: Contexto, ids: string[]): Promise<Map<string, EventoHistorico[]>> {
  const mapa = new Map<string, EventoHistorico[]>();
  if (!ids.length) return mapa;
  const { data, error } = await supabase.from("comissoes_historico").select("comissao_id, campo, valor_anterior, valor_novo, autor, motivo, criado_em")
    .in("comissao_id", ids).order("criado_em", { ascending: false }).limit(2000).returns<EventoHistorico[]>();
  if (error) throw erroBanco(error);
  for (const e of data) mapa.set(e.comissao_id, [...(mapa.get(e.comissao_id) ?? []), e]);
  return mapa;
}

/** L.4: "Alterada por X em DD/MM/AAAA" ou, para a rotina, "Alterada automaticamente em DD/MM/AAAA". */
export function descreverEvento(e: EventoHistorico, nomes: Map<string, string>): string {
  const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const quando = new Date(e.criado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const valor = (v: string | null) => (v == null ? "—" : e.campo === "status" ? rotuloStatus(v) : /^\d{4}-\d{2}-\d{2}$/.test(v) ? dia(v) : v);
  const campo = e.campo === "status" ? "Status" : "Data de recebimento";
  const quem = e.autor ? `Alterada por ${nomes.get(e.autor) ?? "usuário"} em ${quando}` : `Alterada automaticamente em ${quando}`;
  return `${campo}: ${valor(e.valor_anterior)} → ${valor(e.valor_novo)} · ${quem}`;
}

export async function nomesDosAutores({ supabase, userId }: Contexto): Promise<Map<string, string>> {
  const { data } = await supabase.from("usuarios").select("nome").eq("id", userId).maybeSingle<{ nome: string }>();
  return new Map([[userId, data?.nome ?? "você"]]);
}

export type LoteAprovacao = {
  id: string; criado_em: string; autor: string | null; quantidade: number; valor_total: number; motivos: Record<string, number>;
  filtro: Record<string, unknown>; aprovadas_agora: number; reaberto_em: string | null;
};

export async function listarLotes({ supabase }: Contexto): Promise<LoteAprovacao[]> {
  const [lotes, reab, atuais] = await Promise.all([
    supabase.from("comissoes_lotes").select("id, criado_em, autor, quantidade, valor_total, motivos, filtro").eq("tipo", "aprovacao").order("criado_em", { ascending: false }).limit(200),
    supabase.from("comissoes_lotes").select("lote_ref, criado_em").eq("tipo", "reabertura").limit(1000),
    supabase.from("comissoes").select("lote_aprovacao_id, status, aprovada_em").not("lote_aprovacao_id", "is", null).limit(LIMITE),
  ]);
  for (const r of [lotes, reab, atuais]) if (r.error) throw erroBanco(r.error);
  const reabertos = new Map((reab.data as { lote_ref: string; criado_em: string }[]).map((r) => [r.lote_ref, r.criado_em]));
  const contagem = new Map<string, number>();
  for (const c of atuais.data as { lote_aprovacao_id: string; status: string; aprovada_em: string | null }[]) {
    if (statusNoGrupo(c.status) === "recebido" && c.aprovada_em) contagem.set(c.lote_aprovacao_id, (contagem.get(c.lote_aprovacao_id) ?? 0) + 1);
  }
  return (lotes.data as Omit<LoteAprovacao, "aprovadas_agora" | "reaberto_em">[]).map((l) => ({
    ...l, valor_total: Number(l.valor_total), aprovadas_agora: contagem.get(l.id) ?? 0, reaberto_em: reabertos.get(l.id) ?? null,
  }));
}

/** J.3: quantas comissões do lote têm data de recebimento editada manualmente (confirmação extra). */
export async function editadasNoLote({ supabase }: Contexto, lote: string): Promise<number> {
  const { count, error } = await supabase.from("comissoes").select("id", { count: "exact", head: true })
    .eq("lote_aprovacao_id", idSchema.parse(lote)).eq("data_recebimento_editada", true);
  if (error) throw erroBanco(error);
  return count ?? 0;
}

/* ---------- Ações (funções SQL; transacionais; histórico gravado pelo gatilho) ---------- */

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD)")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "Data inválida");

/** 'Marcar como recebida' (prevista/reaberta) ou H.4 'Analisar e marcar como recebida' (limpa os motivos). */
export async function marcarRecebida({ supabase }: Contexto, id: string, analise = false): Promise<void> {
  const { error } = await supabase.rpc("marcar_comissao_recebida", { p_id: idSchema.parse(id), p_analise: z.boolean().parse(analise) });
  if (error) throw erroBanco(error);
}

export async function reabrirComissao({ supabase }: Contexto, id: string): Promise<void> {
  const { error } = await supabase.rpc("reabrir_comissao", { p_id: idSchema.parse(id) });
  if (error) throw erroBanco(error);
}

/** 'Definir comissão' / 'Editar comissão' (D.5): valor manual (origem 'manual'). */
export async function definirComissao({ supabase }: Contexto, id: string, valor: unknown): Promise<void> {
  const v = z.preprocess((x) => (typeof x === "string" ? Number(x.replace(/\./g, "").replace(",", ".")) : x),
    z.number("Informe o valor da comissão").min(0, "Valor não pode ser negativo").max(99_999_999, "Valor inválido")).parse(valor);
  const { error } = await supabase.rpc("definir_comissao", { p_id: idSchema.parse(id), p_valor: v });
  if (error) throw erroBanco(error);
}

/** K: atualizarDataRecebimento — data <= hoje → recebida; > hoje → prevista; vazia → 'Remover data'. */
export async function atualizarDataRecebimento({ supabase }: Contexto, id: string, data: unknown): Promise<StatusComissao> {
  const d = data == null || data === "" ? null : dataSchema.parse(data);
  const { data: status, error } = await supabase.rpc("atualizar_data_recebimento", { p_id: idSchema.parse(id), p_data: d });
  if (error) throw erroBanco(error);
  return status as StatusComissao;
}

export const LIMITE_LOTE = 2000;

/** I: aprovação em lote (transacional; até 2.000; valor nunca alterado; motivos preservados). */
export async function aprovarLote({ supabase }: Contexto, ids: unknown, filtro: unknown): Promise<{ lote_id: string; quantidade: number; valor_total: number }> {
  const lista = z.array(idSchema).min(1, "Selecione ao menos uma comissão").parse(ids);
  if (lista.length > LIMITE_LOTE) throw new AppError(400, `Seleção acima de ${LIMITE_LOTE.toLocaleString("pt-BR")} comissões: refine o filtro`, "limite_lote");
  const { data, error } = await supabase.rpc("aprovar_comissoes_lote", { p_ids: lista, p_filtro: z.record(z.string(), z.unknown()).parse(filtro ?? {}) });
  if (error) throw erroBanco(error);
  return data as { lote_id: string; quantidade: number; valor_total: number };
}

export async function reabrirLote({ supabase }: Contexto, lote: string): Promise<{ quantidade: number; valor_total: number; datas_editadas: number }> {
  const { data, error } = await supabase.rpc("reabrir_lote_comissoes", { p_lote: idSchema.parse(lote) });
  if (error) throw erroBanco(error);
  return data as { quantidade: number; valor_total: number; datas_editadas: number };
}

/** Resumo da seleção para a confirmação do lote (I.2): quantidade, valor total e distribuição por motivo. */
export async function resumoSelecao({ supabase }: Contexto, ids: unknown): Promise<{ quantidade: number; valor: number; motivos: Record<string, number>; invalidas: number }> {
  const lista = z.array(idSchema).max(LIMITE_LOTE + 1).parse(ids);
  const motivos: Record<string, number> = {};
  let valor = 0, invalidas = 0;
  for (let i = 0; i < lista.length; i += 500) {
    const { data, error } = await supabase.from("comissoes").select("valor, status, motivos_pendencia").in("id", lista.slice(i, i + 500))
      .returns<{ valor: number; status: string; motivos_pendencia: string[] }[]>();
    if (error) throw erroBanco(error);
    for (const c of data) {
      if (!selecionavelEmLote(c.status)) invalidas++;
      valor += Number(c.valor);
      for (const m of c.motivos_pendencia) motivos[m] = (motivos[m] ?? 0) + 1;
    }
  }
  return { quantidade: lista.length, valor: arred(valor), motivos, invalidas };
}

