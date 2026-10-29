import { lerJson, rota } from "@/server/rota";
import { listarPedidos } from "@/server/consultas";
import { criarPedido } from "@/server/pedidos";

/** GET ?q= — busca pelo código do pedido (Fase 14). */
export const GET = rota((ctx, { req }) => listarPedidos(ctx, undefined, req.nextUrl.searchParams.get("q")));
/** Body: { representada_id, cliente_id, itens: [{produto_id, quantidade, desconto?}], forma_pagamento?, confirmar?, gerar_codigo?, codigo_pedido? } */
export const POST = rota(async (ctx, { req }) => criarPedido(ctx, await lerJson(req)), 201);
