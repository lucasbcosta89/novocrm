import { lerJson, rota } from "@/server/rota";
import { acaoComissaoSchema } from "@/lib/validacao";
import { marcarRecebida, reabrirComissao } from "@/server/comissoes";

/** Body: { acao: "recebida" | "analisar" | "reabrir" } (Fase 21). */
export const PATCH = rota<{ id: string }>(async (ctx, { req, params }) => {
  const { acao } = acaoComissaoSchema.parse(await lerJson(req));
  if (acao === "reabrir") await reabrirComissao(ctx, params.id);
  else await marcarRecebida(ctx, params.id, acao === "analisar");
  return { ok: true };
});
