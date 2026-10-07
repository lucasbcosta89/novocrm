import { lerJson, rota } from "@/server/rota";
import { push } from "@/server/sync";

/** POST { clientes, visitas, pedidos } pendentes do app → { aplicados, conflitos, rejeitados }. */
export const POST = rota(async (ctx, { req }) => push(ctx, await lerJson(req)));
