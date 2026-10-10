import { definirProdutoOportunidade } from "@/server/oportunidades";
import { lerJson, rota } from "@/server/rota";

/** Body: { produto_id, quantidade } — adiciona ou atualiza a quantidade. → oportunidade detalhada */
export const POST = rota<{ id: string }>(async (ctx, { req, params }) => definirProdutoOportunidade(ctx, params.id, await lerJson(req)));
