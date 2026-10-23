"use server";

import { executarAcao } from "@/server/acao";
import { obterContexto } from "@/server/contexto";
import { atualizarDespesa, criarDespesa, excluirDespesa } from "@/server/custos";
import { limparCacheDashboard } from "@/server/dashboard-principal";
import { normalizarErro } from "@/server/erros";

const BASE = "/app/custos";

const dados = (fd: FormData) => ({
  descricao: fd.get("descricao"),
  data: fd.get("data"),
  valor: fd.get("valor"),
  observacoes: fd.get("observacoes"),
  representadas: fd.getAll("representadas"),
  clientes: fd.getAll("clientes"),
});

/** Popup de despesa (criar ou editar): devolve ok/erro para o modal; a página recarrega com router.refresh. */
export async function salvarDespesaAction(id: string | null, fd: FormData): Promise<{ ok?: true; erro?: string }> {
  try {
    const ctx = await obterContexto();
    if (id) await atualizarDespesa(ctx, id, dados(fd));
    else await criarDespesa(ctx, dados(fd));
    limparCacheDashboard(ctx.userId);
    return { ok: true };
  } catch (e) {
    return { erro: normalizarErro(e).message };
  }
}

export async function excluirDespesaAction(id: string, voltar: string) {
  const destino = voltar.startsWith(BASE) ? voltar : BASE;
  await executarAcao(
    async (ctx) => {
      await excluirDespesa(ctx, id);
      limparCacheDashboard(ctx.userId);
    },
    { ok: destino, erro: destino, mensagem: "Despesa excluída" },
  );
}
