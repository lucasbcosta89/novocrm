import "server-only";
import { envMp } from "@/lib/env";
import { hmacSha256Hex, iguais } from "@/lib/hmac";
import { AppError } from "./erros";

const API = "https://api.mercadopago.com";

export async function mp<T>(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { MP_ACCESS_TOKEN } = envMp();
  const res = await fetch(`${API}${caminho}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.method && init.method !== "GET" ? { "X-Idempotency-Key": crypto.randomUUID() } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    console.error(`Mercado Pago ${init.method ?? "GET"} ${caminho} → ${res.status}: ${detalhe.slice(0, 500)}`);
    // 4xx = dados recusados pelo MP: mostra o motivo (ex.: comprador/vendedor de teste misturados, back_url inválida)
    let motivo = "";
    try {
      motivo = (JSON.parse(detalhe) as { message?: string }).message ?? "";
    } catch {
      /* corpo não-JSON */
    }
    if (res.status >= 400 && res.status < 500 && motivo) {
      throw new AppError(400, `Mercado Pago recusou: ${motivo}`, "mercado_pago");
    }
    throw new AppError(502, `Mercado Pago indisponível (${res.status}). Tente novamente.`, "mercado_pago");
  }
  return (await res.json()) as T;
}

export type MpPreapproval = {
  id: string;
  status: string; // pending | authorized | paused | cancelled
  init_point?: string;
  external_reference?: string;
};

export type MpPayment = {
  id: number;
  status: string; // approved | pending | rejected | ...
  transaction_amount: number;
  external_reference?: string | null;
  metadata?: { preapproval_id?: string } | null;
  point_of_interaction?: { transaction_data?: { subscription_id?: string } } | null;
};

export type MpAuthorizedPayment = {
  id: number;
  preapproval_id: string;
  transaction_amount: number;
  external_reference?: string;
  payment?: { id: number; status: string } | null;
};

/**
 * Valida x-signature do MP: HMAC-SHA256(secret, "id:<data.id>;request-id:<x-request-id>;ts:<ts>;").
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
export async function assinaturaValida(
  segredo: string,
  { xSignature, xRequestId, dataId }: { xSignature: string | null; xRequestId: string | null; dataId: string | null },
): Promise<boolean> {
  if (!segredo || !xSignature) return false;
  const partes = Object.fromEntries(
    xSignature.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k ?? "", v.join("=")];
    }),
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  const id = dataId && /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifesto = "";
  if (id) manifesto += `id:${id};`;
  if (xRequestId) manifesto += `request-id:${xRequestId};`;
  manifesto += `ts:${ts};`;

  return iguais(await hmacSha256Hex(segredo, manifesto), v1.toLowerCase());
}
