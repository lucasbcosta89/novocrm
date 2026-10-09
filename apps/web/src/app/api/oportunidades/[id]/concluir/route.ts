import { concluirOportunidade } from "@/server/oportunidades";
import { lerJson, rota } from "@/server/rota";

/** Body: { resultado: "ganhou" | "perdeu", observacoes_resultado? } → status concluido + data_conclusao. */
export const POST = rota<{ id: string }>(async (ctx, { req, params }) => concluirOportunidade(ctx, params.id, await lerJson(req)));
