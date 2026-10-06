import { lerJson, rota } from "@/server/rota";
import { vincularRepresentadas } from "@/server/clientes";

type P = { id: string };

/** Body: { representada_ids: string[] } — substitui o conjunto de vínculos do cliente. */
export const PUT = rota<P>(async (ctx, { req, params }) => vincularRepresentadas(ctx, params.id, await lerJson(req)));
