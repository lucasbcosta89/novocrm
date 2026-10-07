"use server";

import { headers } from "next/headers";
import { executarAcao } from "@/server/acao";
import { iniciarAssinatura } from "@/server/assinaturas";

/** Cria a assinatura no Mercado Pago e redireciona ao checkout (init_point). */
export async function iniciarAssinaturaAction(fd: FormData) {
  const h = await headers();
  const origem = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  await executarAcao((ctx) => iniciarAssinatura(ctx, fd.get("plano"), origem), {
    ok: (initPoint) => initPoint,
    erro: "/app/configurar",
  });
}
