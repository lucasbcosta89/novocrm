import { lerJson, rota } from "@/server/rota";
import { criarCliente, listarClientes } from "@/server/clientes";

export const GET = rota((ctx) => listarClientes(ctx));
export const POST = rota(async (ctx, { req }) => criarCliente(ctx, await lerJson(req)), 201);
