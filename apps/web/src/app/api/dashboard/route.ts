import { NextResponse, type NextRequest } from "next/server";
import { obterContexto } from "@/server/contexto";
import { obterDashboardPrincipal } from "@/server/dashboard-principal";
import { normalizarErro } from "@/server/erros";

/**
 * GET /api/dashboard?periodo=3m|6m|12m|ano&representada_id=<uuid>|todas
 * Tudo do dashboard principal numa resposta; cache de 60s por usuário + período + representada
 * (meta.cache = "hit" | "miss" e cabeçalho X-Cache).
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await obterContexto();
    const p = req.nextUrl.searchParams;
    const dados = await obterDashboardPrincipal(ctx, { periodo: p.get("periodo"), representada_id: p.get("representada_id") });
    return NextResponse.json(dados, { headers: { "Cache-Control": "private, max-age=60", "X-Cache": dados.meta.cache.toUpperCase() } });
  } catch (e) {
    const erro = normalizarErro(e);
    return NextResponse.json({ erro: erro.message, codigo: erro.code }, { status: erro.status });
  }
}
