import { removerProdutoOportunidade } from "@/server/oportunidades";
import { rota } from "@/server/rota";

export const DELETE = rota<{ id: string; produtoId: string }>((ctx, { params }) => removerProdutoOportunidade(ctx, params.id, params.produtoId));
