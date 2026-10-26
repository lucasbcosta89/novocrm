import { excluirVisao } from "@/server/analises";
import { rota } from "@/server/rota";

export const DELETE = rota<{ id: string }>((ctx, { params }) => excluirVisao(ctx, params.id));
