import { rota } from "@/server/rota";
import { listarOportunidades } from "@/server/consultas";

export const GET = rota<{ id: string }>((ctx, { params }) => listarOportunidades(ctx, params.id));
