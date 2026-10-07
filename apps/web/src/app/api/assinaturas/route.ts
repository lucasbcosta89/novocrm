import { z } from "zod";
import { iniciarAssinatura, obterAssinatura } from "@/server/assinaturas";
import { lerJson, rota } from "@/server/rota";

export const GET = rota((ctx) => obterAssinatura(ctx));

/** Body: { plano } → { init_point } (checkout do Mercado Pago). */
export const POST = rota(async (ctx, { req }) => {
  const { plano } = z.object({ plano: z.string() }).parse(await lerJson(req));
  return { init_point: await iniciarAssinatura(ctx, plano, req.nextUrl.origin) };
}, 201);
