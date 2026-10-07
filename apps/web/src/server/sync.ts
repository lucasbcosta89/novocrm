import { z } from "zod";
import { clienteSchema, idSchema, visitaSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { erroBanco, normalizarErro } from "./erros";

/**
 * Sync local-first do app mobile (protocolo estilo WatermelonDB):
 *  - pull incremental por updated_at (+ exclusões) com sobreposição de 5s contra commits concorrentes;
 *  - push dos registros pendentes com UUID gerado no cliente; conflito = last-write-wins por updated_at.
 */

const SOBREPOSICAO_MS = 5000;

const CAMPOS_CLIENTE = "id, nome, documento, email, celular, whatsapp, cidade, uf, cep, segmento, anotacoes, status, updated_at";
const CAMPOS_VISITA = "id, cliente_id, representada_id, data, tipo, anotacoes, resultado, updated_at";
const CAMPOS_PEDIDO = "id, numero, data, status, valor_total, cliente_id, representada_id, origem, updated_at";

export async function pull({ supabase }: Contexto, since: string | null) {
  const servidor_em = new Date().toISOString();
  const desde = since && !Number.isNaN(Date.parse(since)) ? new Date(Date.parse(since) - SOBREPOSICAO_MS).toISOString() : null;
  const inc = <T extends { gt: (c: string, v: string) => T }>(q: T, coluna: string) => (desde ? q.gt(coluna, desde) : q);

  const [clientes, visitas, pedidos, exclusoes, representadas, produtos, vinculos] = await Promise.all([
    inc(supabase.from("clientes").select(CAMPOS_CLIENTE), "updated_at"),
    inc(supabase.from("visitas").select(CAMPOS_VISITA), "updated_at"),
    inc(supabase.from("pedidos").select(CAMPOS_PEDIDO), "updated_at"),
    desde
      ? supabase.from("sync_exclusoes").select("tabela, registro_id").gt("excluido_em", desde)
      : Promise.resolve({ data: [] as { tabela: string; registro_id: string }[], error: null }),
    // tabelas pequenas de referência: snapshot completo a cada sync
    supabase.from("representadas").select("id, nome, slug, catalogo_publico").order("nome"),
    supabase
      .from("produtos")
      .select("id, representada_id, sku, nome, unidade, categoria, preco, tabelas_preco(preco)")
      .eq("ativo", true)
      .is("tabelas_preco.cliente_id", null),
    supabase.from("cliente_representada").select("cliente_id, representada_id"),
  ]);
  for (const r of [clientes, visitas, pedidos, exclusoes, representadas, produtos, vinculos]) if (r.error) throw erroBanco(r.error);

  type ProdutoRow = { id: string; representada_id: string; sku: string; nome: string; unidade: string | null; categoria: string | null; preco: number; tabelas_preco: { preco: number }[] };
  return {
    servidor_em,
    clientes: clientes.data,
    visitas: visitas.data,
    pedidos: pedidos.data,
    exclusoes: exclusoes.data,
    representadas: representadas.data,
    produtos: (produtos.data as ProdutoRow[]).map(({ tabelas_preco, ...p }) => ({ ...p, preco: Number(tabelas_preco[0]?.preco ?? p.preco) })),
    vinculos: vinculos.data,
  };
}

const atualizado = z.iso.datetime({ offset: true });

export const pushSchema = z.object({
  clientes: z.array(clienteSchema.extend({ id: idSchema, updated_at: atualizado })).max(500).default([]),
  visitas: z
    .array(visitaSchema.extend({ id: idSchema, cliente_id: idSchema, updated_at: atualizado }))
    .max(1000)
    .default([]),
  pedidos: z
    .array(
      z.object({
        id: idSchema,
        cliente_id: idSchema,
        representada_id: idSchema,
        forma_pagamento: z.string().max(60).nullable().optional(),
        itens: z.array(z.object({ produto_id: idSchema, quantidade: z.number().positive() })).min(1).max(500),
      }),
    )
    .max(200)
    .default([]),
});

export type ResultadoPush = {
  aplicados: string[];
  /** servidor_vence = havia versão mais nova no servidor (LWW): o app descarta a local e recebe a do servidor no pull. */
  conflitos: { id: string; servidor_vence: true }[];
  rejeitados: { id: string; motivo: string }[];
};

/** Insere ou aplica LWW (updated_at mais recente vence) em uma tabela com updated_at. */
async function upsertLww(
  { supabase, userId }: Contexto,
  tabela: "clientes" | "visitas",
  registro: { id: string; updated_at: string } & Record<string, unknown>,
  r: ResultadoPush,
) {
  const { id, updated_at, ...dados } = registro;
  try {
    const { data: atual, error } = await supabase.from(tabela).select("updated_at").eq("id", id).maybeSingle<{ updated_at: string }>();
    if (error) throw erroBanco(error);
    if (!atual) {
      const extra = tabela === "visitas" ? { sync_status: "sincronizado" } : {};
      const { error: e } = await supabase.from(tabela).insert({ id, user_id: userId, ...dados, ...extra });
      if (e) throw erroBanco(e, "Registro duplicado");
      r.aplicados.push(id);
    } else if (Date.parse(updated_at) > Date.parse(atual.updated_at)) {
      const { error: e } = await supabase.from(tabela).update(dados).eq("id", id);
      if (e) throw erroBanco(e, "Registro duplicado");
      r.aplicados.push(id);
    } else {
      r.conflitos.push({ id, servidor_vence: true });
    }
  } catch (e) {
    r.rejeitados.push({ id, motivo: normalizarErro(e).message });
  }
}

export async function push(ctx: Contexto, input: unknown): Promise<ResultadoPush> {
  const p = pushSchema.parse(input);
  const r: ResultadoPush = { aplicados: [], conflitos: [], rejeitados: [] };

  // ordem importa: visitas/pedidos podem apontar para clientes criados offline
  for (const c of p.clientes) await upsertLww(ctx, "clientes", c, r);
  for (const v of p.visitas) await upsertLww(ctx, "visitas", v, r);
  for (const pe of p.pedidos) {
    // pedido offline vira rascunho no servidor (preço e comissão calculados no banco); idempotente pelo id
    const { error } = await ctx.supabase.rpc("criar_pedido", {
      p_representada_id: pe.representada_id,
      p_cliente_id: pe.cliente_id,
      p_itens: pe.itens,
      p_forma_pagamento: pe.forma_pagamento ?? null,
      p_confirmar: false,
      p_id: pe.id,
    });
    if (error) r.rejeitados.push({ id: pe.id, motivo: erroBanco(error).message });
    else r.aplicados.push(pe.id);
  }
  return r;
}
