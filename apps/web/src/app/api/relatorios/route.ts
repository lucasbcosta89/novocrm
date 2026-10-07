import { listarDocumentos, solicitarDocumento } from "@/server/documentos";
import { lerJson, rota } from "@/server/rota";

export const GET = rota((ctx) => listarDocumentos(ctx));

/**
 * Body: { tipo: "relatorio_periodo" | "relatorio_comissao", representada_id, periodo: "AAAA-MM" }
 *     | { tipo: "catalogo", representada_id | "todas" }
 * → { documento, url, cache }. Geração assíncrona: status "gerando" → "pronto".
 */
export const POST = rota(async (ctx, { req }) => solicitarDocumento(ctx, await lerJson(req)), 202);
