import { chavesExistentes } from "@/server/importacao";
import { rota } from "@/server/rota";

/** GET /api/importacao/[entidade]/existentes — chaves já cadastradas (dedupe da pré-validação; só leitura, RLS). */
export const GET = rota<{ entidade: string }>((ctx, { params }) => chavesExistentes(ctx, params.entidade));
