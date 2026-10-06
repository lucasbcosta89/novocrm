import { lerJson, rota } from "@/server/rota";
import { listarPedidos } from "@/server/consultas";
import { criarPedido } from "@/server/pedidos";

export const GET = rota((ctx) => listarPedidos(ctx));
/** Body: { representada_id, cliente_id, itens: [{produto_id, quantidade, desconto?}], forma_pagamento?, confirmar? } */
export const POST = rota(async (ctx, { req }) => criarPedido(ctx, await lerJson(req)), 201);
