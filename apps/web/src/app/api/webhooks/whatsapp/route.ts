import { after, NextResponse, type NextRequest } from "next/server";
import { assinaturaMetaValida, processarWebhookMeta, type PayloadMeta } from "@/server/whatsapp";

/** Verificação do webhook pela Meta (hub.challenge). */
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (sp.get("hub.mode") === "subscribe" && token && sp.get("hub.verify_token") === token) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/** Recebimento: valida X-Hub-Signature-256, responde 200 na hora e processa depois (idempotente por meta_message_id). */
export async function POST(req: NextRequest) {
  const bruto = await req.text();
  if (!(await assinaturaMetaValida(bruto, req.headers.get("x-hub-signature-256")))) {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }
  let payload: PayloadMeta;
  try {
    payload = JSON.parse(bruto) as PayloadMeta;
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 });
  }
  after(() => processarWebhookMeta(payload).catch((e) => console.error("webhook WhatsApp", e)));
  return NextResponse.json({ ok: true });
}
