import { z } from "zod";
import { descreverAlerta, filtroAlertasSchema, TIPOS_ALERTA, type FiltroAlertas, type TipoAlerta, type StatusAlerta, type ValoresAlerta } from "@/lib/comissao";

export { filtroAlertasSchema, type FiltroAlertas };
import { dataFaturamentoSchema, idSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";
import { atualizarProduto } from "./produtos";

/**
 * Fase 19 — alertas de divergência dos pedidos (tabela alertas_pedido, RLS do usuário; nada com service role).
 * O recálculo é idempotente e vive no banco (recalcular_alertas_pedido), chamado ao salvar/emitir o pedido.
 * Nenhuma função daqui grava comissão no catálogo, exceto propagarComissaoRepresentada — SÓ por clique explícito.
 */

const umValor = (v: unknown) => (Array.isArray(v) ? v[0] : v);

export type LinhaAlerta = {
  id: string;
  tipo: TipoAlerta;
  status: StatusAlerta;
  valores: ValoresAlerta;
  criado_em: string;
  resolvido_em: string | null;
  pedido: { id: string; codigo_pedido: string; data: string; origem: string; representada_id: string; cliente: { id: string; nome: string } | null };
  produto: { id: string; sku: string; nome: string; representada_id: string; preco: number } | null;
  praticado: string;
  referencia: string;
  diferenca: number;
};

export type QuadroAlertas = {
  filtro: FiltroAlertas;
  linhas: LinhaAlerta[];
  /** pendentes por tipo (cards) e total */
  resumo: Record<TipoAlerta, number>;
  totalPendentes: number;
  /** a URL trouxe filtro do quadro (mostra o quadro mesmo sem pendentes) */
  filtrando: boolean;
};

const LIMITE = 500;

export async function quadroAlertas({ supabase }: Contexto, entrada: Record<string, unknown>): Promise<QuadroAlertas> {
  const f = filtroAlertasSchema.parse(entrada) as FiltroAlertas;
  const filtrando = ["a_tipo", "a_status", "a_ordem"].some((k) => umValor(entrada[k]));

  const { data: pend, error: e1 } = await supabase.from("alertas_pedido").select("tipo").eq("status", "pendente").limit(10_000).returns<{ tipo: TipoAlerta }[]>();
  if (e1) throw erroBanco(e1);
  const resumo = Object.fromEntries(TIPOS_ALERTA.map((t) => [t, 0])) as Record<TipoAlerta, number>;
  for (const a of pend) resumo[a.tipo] += 1;

  let q = supabase
    .from("alertas_pedido")
    .select(
      "id, tipo, status, valores, criado_em, resolvido_em, " +
        "pedido:pedidos!inner(id, codigo_pedido, data, origem, representada_id, cliente:clientes(id, nome)), produto:produtos(id, sku, nome, representada_id, preco)",
    )
    .eq("status", f.a_status)
    .order("criado_em", { ascending: false })
    .limit(LIMITE);
  if (f.a_tipo) q = q.eq("tipo", f.a_tipo);
  const { data, error } = await q.returns<Omit<LinhaAlerta, "praticado" | "referencia" | "diferenca">[]>();
  if (error) throw erroBanco(error);
  const linhas = data.map((a) => ({ ...a, ...descreverAlerta(a.tipo, a.valores ?? {}) }));
  linhas.sort((a, b) => (f.a_ordem === "diferenca" ? b.diferenca - a.diferenca : b.pedido.data.localeCompare(a.pedido.data)));
  return { filtro: f, linhas, resumo, totalPendentes: pend.length, filtrando };
}

/** Aprovar um alerta pendente (aceita a divergência): status aprovado + resolvido_em. */
export async function aprovarAlerta({ supabase }: Contexto, id: string): Promise<number> {
  const { error, count } = await supabase
    .from("alertas_pedido").update({ status: "aprovado", resolvido_em: new Date().toISOString() }, { count: "exact" })
    .eq("id", idSchema.parse(id)).eq("status", "pendente");
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Alerta não encontrado ou já tratado", "nao_encontrado");
  return count;
}

/** "Aprovar todos" do filtro atual (pendentes, opcionalmente de um tipo). Devolve o total afetado. */
export async function aprovarAlertaPorTipo({ supabase }: Contexto, tipo: unknown): Promise<number> {
  const t = z.enum(TIPOS_ALERTA).nullable().parse(tipo || null);
  let q = supabase.from("alertas_pedido").update({ status: "aprovado", resolvido_em: new Date().toISOString() }, { count: "exact" }).eq("status", "pendente");
  if (t) q = q.eq("tipo", t);
  const { error, count } = await q;
  if (error) throw erroBanco(error);
  return count ?? 0;
}

/**
 * Altera o preço do produto no catálogo (preço padrão) e resolve (corrigido) os alertas de preço pendentes daquele
 * produto. Preços já gravados nos itens dos pedidos NÃO mudam. Devolve os pedidos impactados.
 */
export async function atualizarPrecoCatalogo(ctx: Contexto, produtoId: unknown, novoPreco: unknown): Promise<{ pedidos: string[] }> {
  const id = idSchema.parse(produtoId);
  const preco = z.coerce.number("Preço inválido").min(0, "O preço não pode ser negativo").max(99_999_999, "Preço inválido").parse(novoPreco);
  await atualizarProduto(ctx, id, { preco: Math.round(preco * 100) / 100 });
  const { data, error } = await ctx.supabase
    .from("alertas_pedido").update({ status: "corrigido", resolvido_em: new Date().toISOString() })
    .eq("produto_id", id).eq("tipo", "preco_divergente").eq("status", "pendente")
    .select("pedido:pedidos(codigo_pedido)")
    .returns<{ pedido: { codigo_pedido: string } | null }[]>();
  if (error) throw erroBanco(error);
  return { pedidos: [...new Set(data.map((a) => a.pedido?.codigo_pedido).filter((c): c is string => !!c))] };
}

/**
 * J.1 — copia a comissão da representada para os produtos VINCULADOS a ela que estão SEM comissão (nulo ou 0),
 * em transação e de forma idempotente (produto com comissão é preservado). Chamada SOMENTE por clique explícito.
 */
export async function propagarComissaoRepresentada({ supabase }: Contexto, representadaId: unknown): Promise<{ atualizados: number; preservados: number; percentual: number }> {
  const { data, error } = await supabase.rpc("propagar_comissao_representada", { p_representada_id: idSchema.parse(representadaId) });
  if (error) throw erroBanco(error);
  const r = data as { atualizados: number; preservados: number; percentual: number };
  return { atualizados: Number(r.atualizados), preservados: Number(r.preservados), percentual: Number(r.percentual) };
}

/** Produtos vinculados à representada sem comissão no catálogo (oferta de propagação). */
export async function contarProdutosSemComissao({ supabase }: Contexto, representadaId: string): Promise<number> {
  const { count, error } = await supabase
    .from("produtos").select("id", { count: "exact", head: true })
    .eq("representada_id", idSchema.parse(representadaId)).or("comissao.is.null,comissao.lte.0");
  if (error) throw erroBanco(error);
  return count ?? 0;
}

/** Recálculo idempotente dos alertas de um pedido (respeita a isenção de desconto/preço do importado). */
export async function recalcularAlertasPedido({ supabase }: Contexto, pedidoId: unknown): Promise<{ ativos: number; resolvidos: number }> {
  const { data, error } = await supabase.rpc("recalcular_alertas_pedido", { p_pedido_id: idSchema.parse(pedidoId) });
  if (error) throw erroBanco(error);
  return data as { ativos: number; resolvidos: number };
}

/** Reavalia os pedidos com alerta pendente após salvar comissão/preço no cadastro (representada e/ou produto). */
export async function recalcularAlertasPendentes({ supabase }: Contexto, alvo: { representada_id?: string; produto_id?: string }): Promise<number> {
  const { data, error } = await supabase.rpc("recalcular_alertas_pendentes", {
    p_representada_id: alvo.representada_id ? idSchema.parse(alvo.representada_id) : null,
    p_produto_id: alvo.produto_id ? idSchema.parse(alvo.produto_id) : null,
  });
  if (error) throw erroBanco(error);
  return Number(data ?? 0);
}

/** C.2 — define/limpa só a data de faturamento (não mexe em itens, valores nem comissão). */
export async function definirDataFaturamento({ supabase }: Contexto, pedidoId: unknown, data: unknown): Promise<void> {
  const d = dataFaturamentoSchema.parse(data);
  const { error, count } = await supabase.from("pedidos").update({ data_faturamento: d }, { count: "exact" }).eq("id", idSchema.parse(pedidoId));
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Pedido não encontrado", "nao_encontrado");
}
