import { lerJson, rota } from "@/server/rota";
import { marcarComissao } from "@/server/comissoes";

/** Body: { status: "recebida" | "atrasada" | "a_receber" } */
export const PATCH = rota<{ id: string }>(async (ctx, { req, params }) => marcarComissao(ctx, params.id, await lerJson(req)));
