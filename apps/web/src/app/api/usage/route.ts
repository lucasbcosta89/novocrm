import { rota } from "@/server/rota";
import { obterUso } from "@/server/quota";

/** Plano atual + uso e limite de cada recurso ({ atingido } para o front desabilitar botões). */
export const GET = rota((ctx) => obterUso(ctx));
