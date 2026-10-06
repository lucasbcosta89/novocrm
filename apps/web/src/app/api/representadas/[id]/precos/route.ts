import { rota } from "@/server/rota";
import { listarTabelaPrecos } from "@/server/consultas";

export const GET = rota<{ id: string }>((ctx, { params }) => listarTabelaPrecos(ctx, params.id));
