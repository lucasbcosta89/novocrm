"use server";

import { headers } from "next/headers";
import { executarAcao } from "@/server/acao";
import { cancelarAssinatura, conciliarAssinatura, iniciarAssinatura } from "@/server/assinaturas";

/** Inicia o pagamento na forma escolhida (cartão mensal/anual, Pix mensal/anual) e redireciona ao checkout do MP. */
export async function iniciarAssinaturaAction(fd: FormData) {
  const h = await headers();
  const origem = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  await executarAcao((ctx) => iniciarAssinatura(ctx, fd.get("forma"), origem), {
    ok: (initPoint) => initPoint,
    erro: "/app/configurar",
  });
}

/** Cancela a recorrência no cartão; o acesso segue até o fim do período pago. */
export async function cancelarAssinaturaAction() {
  await executarAcao((ctx) => cancelarAssinatura(ctx), {
    ok: () => `/app/configurar?ok=${encodeURIComponent("Assinatura cancelada. Seu acesso continua até o fim do período já pago.")}`,
    erro: "/app/configurar",
  });
}

/** Confere no Mercado Pago se o pagamento foi aprovado (caso a notificação ainda não tenha chegado). */
export async function verificarPagamentoAction() {
  let mensagem = "";
  await executarAcao(
    async (ctx) => {
      const { aplicados } = await conciliarAssinatura(ctx.userId);
      mensagem = aplicados ? "Pagamento confirmado: assinatura ativada!" : "Pagamento ainda não aprovado pelo Mercado Pago. Tente em instantes.";
    },
    { ok: () => `/app/configurar?ok=${encodeURIComponent(mensagem)}`, erro: "/app/configurar" },
  );
}
