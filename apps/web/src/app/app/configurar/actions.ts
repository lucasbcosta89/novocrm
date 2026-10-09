"use server";

import { headers } from "next/headers";
import { executarAcao } from "@/server/acao";
import { conciliarAssinatura, iniciarAssinatura } from "@/server/assinaturas";

/** Cria a assinatura no Mercado Pago e redireciona ao checkout (init_point). */
export async function iniciarAssinaturaAction(fd: FormData) {
  const h = await headers();
  const origem = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  await executarAcao((ctx) => iniciarAssinatura(ctx, fd.get("plano"), origem), {
    ok: (initPoint) => initPoint,
    erro: "/app/configurar",
  });
}

/** Confere no Mercado Pago se o pagamento foi aprovado (caso a notificação ainda não tenha chegado). */
export async function verificarPagamentoAction() {
  let mensagem = "";
  await executarAcao(
    async (ctx) => {
      const { aplicados } = await conciliarAssinatura(ctx.userId);
      mensagem = aplicados ? "Pagamento confirmado: plano liberado!" : "Pagamento ainda não aprovado pelo Mercado Pago. Tente em instantes.";
    },
    { ok: () => `/app/configurar?ok=${encodeURIComponent(mensagem)}`, erro: "/app/configurar" },
  );
}
