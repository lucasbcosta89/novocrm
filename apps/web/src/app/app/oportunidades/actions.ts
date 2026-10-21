"use server";

import { executarAcao } from "@/server/acao";
import { obterContexto } from "@/server/contexto";
import { normalizarErro } from "@/server/erros";
import { adicionarEtapa, criarFunil, excluirEtapa, renomearEtapa } from "@/server/funis";
import { atualizarOportunidade } from "@/server/oportunidades";

const BASE = "/app/oportunidades";

export async function criarFunilAction(fd: FormData) {
  let id = "";
  await executarAcao(
    async (ctx) => {
      id = await criarFunil(ctx, { nome: fd.get("nome"), modelo: fd.get("modelo") });
    },
    // criado a partir do kanban: abre o funil novo; da página inicial: volta para ela
    { ok: () => (fd.get("voltar") === "kanban" ? `${BASE}/funis/${id}` : BASE), erro: BASE, mensagem: "Funil criado" },
  );
}

/** Desarquivar: volta ao kanban do funil, na mesma etapa (etapa_id não muda). */
export async function desarquivarAction(id: string, voltar: string) {
  if (!voltar.startsWith(`${BASE}/arquivo`)) voltar = `${BASE}/arquivo`; // só volta para o Arquivo
  await executarAcao((ctx) => atualizarOportunidade(ctx, id, { arquivada: false }), {
    ok: voltar,
    erro: voltar,
    mensagem: "Oportunidade desarquivada: voltou ao kanban",
  });
}

/* Personalizar funil: chamadas do popup (retornam ok/erro; a página recarrega com router.refresh). */
type Resultado = { ok?: true; erro?: string };

async function tentar(fn: () => Promise<void>): Promise<Resultado> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    return { erro: normalizarErro(e).message };
  }
}

export async function adicionarEtapaAction(funilId: string, nome: string) {
  return tentar(async () => adicionarEtapa(await obterContexto(), funilId, { nome }));
}

export async function renomearEtapaAction(etapaId: string, nome: string) {
  return tentar(async () => renomearEtapa(await obterContexto(), etapaId, { nome }));
}

export async function excluirEtapaAction(etapaId: string) {
  return tentar(async () => excluirEtapa(await obterContexto(), etapaId));
}
