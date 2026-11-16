"use server";

import { revalidatePath } from "next/cache";
import { executarAcao } from "@/server/acao";
import {
  aprovarAlerta, aprovarAlertaPorTipo, atualizarPrecoCatalogo, definirDataFaturamento, propagarComissaoRepresentada, recalcularAlertasPedido,
} from "@/server/alertas-pedido";
import { obterContexto } from "@/server/contexto";
import { normalizarErro } from "@/server/erros";

/** Fase 19 — ações dos avisos do formulário, do quadro de divergências e da data de faturamento. Todas com RLS. */

const BASE = "/app/pedidos";
/** volta para a página de pedidos mantendo os filtros do quadro (só caminhos internos) */
const destino = (voltar: unknown) => (typeof voltar === "string" && voltar.startsWith(BASE) ? voltar : BASE);

/* ----- chamadas do formulário (cliente): devolvem o resultado, sem redirecionar ----- */

export async function atualizarPrecoCatalogoAction(produtoId: string, novoPreco: number): Promise<{ ok?: string; erro?: string }> {
  try {
    const r = await atualizarPrecoCatalogo(await obterContexto(), produtoId, novoPreco);
    revalidatePath(BASE);
    return { ok: `Preço do catálogo atualizado${r.pedidos.length ? `; alertas de preço resolvidos em ${r.pedidos.join(", ")}` : ""}.` };
  } catch (e) {
    return { erro: normalizarErro(e).message };
  }
}

/** SÓ por clique explícito (botão + confirmação). Nenhum outro caminho grava comissão no catálogo. */
export async function propagarComissaoAction(representadaId: string): Promise<{ ok?: string; erro?: string; percentual?: number }> {
  try {
    const r = await propagarComissaoRepresentada(await obterContexto(), representadaId);
    revalidatePath(BASE);
    revalidatePath(`/app/representadas/${representadaId}`);
    return { ok: `${r.atualizados} produto(s) atualizado(s) com ${String(r.percentual).replace(".", ",")}%; ${r.preservados} preservado(s) (já tinham comissão).`, percentual: r.percentual };
  } catch (e) {
    return { erro: normalizarErro(e).message };
  }
}

/* ----- formulários (redirecionam com ?ok= / ?erro=) ----- */

export async function aprovarAlertaAction(id: string, voltar: string) {
  await executarAcao((ctx) => aprovarAlerta(ctx, id), { ok: destino(voltar), erro: destino(voltar), mensagem: "Alerta aprovado" });
}

export async function aprovarTodosAction(tipo: string | null, voltar: string) {
  let n = 0;
  await executarAcao(async (ctx) => { n = await aprovarAlertaPorTipo(ctx, tipo); }, {
    ok: () => `${destino(voltar)}${destino(voltar).includes("?") ? "&" : "?"}ok=${encodeURIComponent(`${n} alerta(s) aprovado(s)`)}`,
    erro: destino(voltar),
  });
}

export async function alterarPrecoQuadroAction(produtoId: string, novoPreco: number, voltar: string) {
  let pedidos: string[] = [];
  await executarAcao(async (ctx) => { pedidos = (await atualizarPrecoCatalogo(ctx, produtoId, novoPreco)).pedidos; }, {
    ok: () => `${destino(voltar)}${destino(voltar).includes("?") ? "&" : "?"}ok=${encodeURIComponent(`Preço do catálogo atualizado; ${pedidos.length} pedido(s) com o alerta resolvido`)}`,
    erro: destino(voltar),
  });
}

/** Detalhe da representada (J.2): aplica a comissão aos produtos vinculados sem comissão. */
export async function propagarComissaoRepresentadaFormAction(representadaId: string) {
  let msg = "";
  await executarAcao(async (ctx) => {
    const r = await propagarComissaoRepresentada(ctx, representadaId);
    msg = `${r.atualizados} produto(s) atualizado(s); ${r.preservados} preservado(s) (já tinham comissão)`;
  }, { ok: () => `/app/representadas/${representadaId}?ok=${encodeURIComponent(msg)}`, erro: `/app/representadas/${representadaId}` });
}

/** C.2 — altera só a data de faturamento (vazio = limpa). */
export async function definirDataFaturamentoAction(pedidoId: string, fd: FormData) {
  await executarAcao((ctx) => definirDataFaturamento(ctx, pedidoId, fd.get("data_faturamento")), {
    ok: `${BASE}/${pedidoId}`, erro: `${BASE}/${pedidoId}`, mensagem: "Data de faturamento salva",
  });
}

export async function recalcularAlertasAction(pedidoId: string) {
  await executarAcao((ctx) => recalcularAlertasPedido(ctx, pedidoId), { ok: `${BASE}/${pedidoId}`, erro: `${BASE}/${pedidoId}`, mensagem: "Alertas reavaliados" });
}
