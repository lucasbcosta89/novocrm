import { limparCacheDashboard } from "@/server/dashboard-principal";
import { lerJson, rota } from "@/server/rota";
import { atualizarAcao, excluirAcao, obterAcao } from "@/server/oportunidades";

type P = { id: string };

/** GET: sub-tarefa com a oportunidade (popup de edição do dashboard). */
export const GET = rota<P>((ctx, { params }) => obterAcao(ctx, params.id));
export const PATCH = rota<P>(async (ctx, { req, params }) => {
  const a = await atualizarAcao(ctx, params.id, await lerJson(req));
  limparCacheDashboard(ctx.userId);
  return a;
});
export const DELETE = rota<P>((ctx, { params }) => excluirAcao(ctx, params.id));
