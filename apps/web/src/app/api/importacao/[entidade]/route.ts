import { importarPlanilha } from "@/server/importacao";
import { lerJson, rota } from "@/server/rota";

/**
 * POST /api/importacao/[entidade] — confirmação da importação: { arquivo_nome, iniciado_em, cabecalho, linhas }.
 * Revalida tudo no servidor e grava só as linhas válidas num lote transacional. Exige permissão de escrita.
 */
export const POST = rota<{ entidade: string }>(async (ctx, { req, params }) => importarPlanilha(ctx, params.entidade, await lerJson(req)));
