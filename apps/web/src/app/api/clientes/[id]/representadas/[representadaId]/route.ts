import { rota } from "@/server/rota";
import { desvincular, vincular } from "@/server/clientes";

type P = { id: string; representadaId: string };

export const POST = rota<P>((ctx, { params }) => vincular(ctx, params.id, params.representadaId));
export const DELETE = rota<P>((ctx, { params }) => desvincular(ctx, params.id, params.representadaId));
