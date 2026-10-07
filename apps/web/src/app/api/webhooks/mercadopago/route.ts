import { after, NextResponse, type NextRequest } from "next/server";
import { enfileirarEvento, processarFila } from "@/server/assinaturas";
import { assinaturaValida } from "@/server/mercadopago";

type Notificacao = { id?: string | number; type?: string; action?: string; data?: { id?: string | number } };

/**
 * Webhook do Mercado Pago: valida x-signature, grava em webhook_events (PK = idempotência),
 * responde 200 na hora e processa a fila depois da resposta (after → waitUntil no Cloudflare).
 */
export async function POST(req: NextRequest) {
  const corpo = ((await req.json().catch(() => null)) ?? {}) as Notificacao;
  const dataId = req.nextUrl.searchParams.get("data.id") ?? (corpo.data?.id != null ? String(corpo.data.id) : null);

  const valida = await assinaturaValida(process.env.MP_WEBHOOK_SECRET ?? "", {
    xSignature: req.headers.get("x-signature"),
    xRequestId: req.headers.get("x-request-id"),
    dataId,
  });
  if (!valida) return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });

  const type = corpo.type ?? req.nextUrl.searchParams.get("type") ?? "desconhecido";
  const id = corpo.id != null ? String(corpo.id) : `${type}:${dataId}:${corpo.action ?? ""}`;
  try {
    await enfileirarEvento({ id, type, recurso_id: dataId, payload: corpo });
  } catch (e) {
    console.error("webhook MP: falha ao enfileirar", e);
    return NextResponse.json({ erro: "falha ao registrar" }, { status: 500 }); // MP reenvia
  }

  after(() => processarFila().catch((e) => console.error("webhook MP: worker", e)));
  return NextResponse.json({ ok: true });
}
