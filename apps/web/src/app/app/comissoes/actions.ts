"use server";

import { revalidatePath } from "next/cache";
import {
  aprovarLote, atualizarDataRecebimento, definirComissao, editadasNoLote, marcarRecebida, reabrirComissao, reabrirLote, resumoSelecao,
} from "@/server/comissoes";
import { obterContexto } from "@/server/contexto";
import { normalizarErro } from "@/server/erros";
import { rotuloStatus } from "@/lib/comissoes/status";

/**
 * Fase 21 — ações da página de Comissões (chamadas pelo cliente; devolvem o resultado sem redirecionar, então o
 * filtro da URL é preservado — P.3). Todas com RLS; o histórico é gravado pelo banco.
 */
type R<T = object> = ({ ok: string } & T) | { erro: string };

async function executar<T extends object>(fn: (ctx: Awaited<ReturnType<typeof obterContexto>>) => Promise<{ ok: string } & T>): Promise<R<T>> {
  try {
    const r = await fn(await obterContexto());
    revalidatePath("/app/comissoes");
    revalidatePath("/app/dashboard");
    return r;
  } catch (e) {
    return { erro: normalizarErro(e).message };
  }
}

export async function marcarRecebidaAction(id: string, analise: boolean) {
  return executar(async (ctx) => { await marcarRecebida(ctx, id, analise); return { ok: analise ? "Comissão analisada e marcada como recebida" : "Comissão marcada como recebida" }; });
}

export async function reabrirComissaoAction(id: string) {
  return executar(async (ctx) => { await reabrirComissao(ctx, id); return { ok: "Comissão reaberta" }; });
}

export async function definirComissaoAction(id: string, valor: string) {
  return executar(async (ctx) => { await definirComissao(ctx, id, valor); return { ok: "Comissão definida (manual)" }; });
}

export async function atualizarDataAction(id: string, data: string | null) {
  return executar(async (ctx) => {
    const s = await atualizarDataRecebimento(ctx, id, data);
    return { ok: data ? `Data de recebimento salva: comissão ${rotuloStatus(s).toLowerCase()}` : `Data removida: comissão ${rotuloStatus(s).toLowerCase()}`, status: s };
  });
}

export async function resumoSelecaoAction(ids: string[]) {
  try {
    return { ok: "", ...(await resumoSelecao(await obterContexto(), ids)) };
  } catch (e) {
    return { erro: normalizarErro(e).message };
  }
}

export async function aprovarLoteAction(ids: string[], filtro: Record<string, unknown>) {
  return executar(async (ctx) => {
    const r = await aprovarLote(ctx, ids, filtro);
    return { ok: `${r.quantidade} comissão(ões) aprovada(s) em lote (${Number(r.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`, lote: r.lote_id };
  });
}

export async function editadasNoLoteAction(lote: string) {
  try {
    return { ok: "", editadas: await editadasNoLote(await obterContexto(), lote) };
  } catch (e) {
    return { erro: normalizarErro(e).message };
  }
}

export async function reabrirLoteAction(lote: string) {
  return executar(async (ctx) => {
    const r = await reabrirLote(ctx, lote);
    return { ok: `Lote reaberto: ${r.quantidade} comissão(ões) voltaram para análise, com os motivos preservados` };
  });
}
