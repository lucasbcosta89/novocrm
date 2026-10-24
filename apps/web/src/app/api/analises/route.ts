import { executarAnalise } from "@/server/analises";
import { lerJson, rota } from "@/server/rota";

/** POST /api/analises — body: AnaliseSpec → ResultadoAgregado (uma consulta agregada). */
export const POST = rota(async (ctx, { req }) => executarAnalise(ctx, await lerJson(req)));
