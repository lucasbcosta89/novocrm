import { limparCacheDashboard } from "@/server/dashboard-principal";
import { lerJson, rota } from "@/server/rota";
import { atualizarTarefa, obterTarefa } from "@/server/tarefas";

type P = { id: string };

export const GET = rota<P>((ctx, { params }) => obterTarefa(ctx, params.id));
/** Body: { titulo?, data?, concluida? } */
export const PATCH = rota<P>(async (ctx, { req, params }) => {
  const t = await atualizarTarefa(ctx, params.id, await lerJson(req));
  limparCacheDashboard(ctx.userId);
  return t;
});
