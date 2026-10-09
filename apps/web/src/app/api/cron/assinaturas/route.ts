import { NextResponse, type NextRequest } from "next/server";
import { conciliarTodas, processarFila } from "@/server/assinaturas";

/**
 * Reprocessa a fila de webhooks (pendentes/erro). Chamar por cron externo com
 * Authorization: Bearer <CRON_SECRET>. Carência/downgrade roda no pg_cron (aplicar_carencia_assinaturas).
 */
export async function POST(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const processados = await processarFila(50);
  return NextResponse.json({ processados, conciliados: await conciliarTodas() });
}
