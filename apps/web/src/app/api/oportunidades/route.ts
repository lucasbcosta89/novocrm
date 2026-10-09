import { resumoOportunidades } from "@/lib/oportunidades";
import { criarOportunidadeGlobal, listarKanban } from "@/server/oportunidades";
import { lerJson, rota } from "@/server/rota";

/** Kanban: todas as oportunidades do usuário + contadores. */
export const GET = rota(async (ctx) => {
  const itens = await listarKanban(ctx);
  return { itens, resumo: resumoOportunidades(itens) };
});

/** Body: { titulo, representada_id, cidade?, estado?, status?, prioridade?, produtos: [{produto_id, quantidade}], acoes: [...] } */
export const POST = rota(async (ctx, { req }) => criarOportunidadeGlobal(ctx, await lerJson(req)), 201);
