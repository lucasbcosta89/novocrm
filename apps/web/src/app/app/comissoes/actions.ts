"use server";

import { executarAcao } from "@/server/acao";
import { marcarComissao } from "@/server/comissoes";

const ROTULO: Record<string, string> = { recebida: "Comissão marcada como recebida", atrasada: "Comissão marcada como atrasada", a_receber: "Comissão reaberta" };

/** `voltar` preserva os filtros da página. */
export async function marcarComissaoAction(id: string, status: "recebida" | "atrasada" | "a_receber", voltar: string) {
  const destino = voltar.startsWith("/app/comissoes") ? voltar : "/app/comissoes";
  await executarAcao((ctx) => marcarComissao(ctx, id, { status }), { ok: destino, erro: destino, mensagem: ROTULO[status] });
}
