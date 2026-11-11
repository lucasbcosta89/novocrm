import { NextResponse, type NextRequest } from "next/server";
import { gerarCsv } from "@/lib/csv";
import { formatarData } from "@/lib/formato";
import { gerarXlsx } from "@/lib/planilha";
import { ROTULO_STATUS_PEDIDO } from "@/lib/rotulos";
import { listarPedidosFiltrados } from "@/server/consultas";
import { obterContexto } from "@/server/contexto";
import { normalizarErro } from "@/server/erros";

const CABECALHO = ["Código", "Nº interno", "Data", "Cliente", "Representada", "Status", "Valor total (R$)", "Comissão (R$)", "Pendências"];

/** GET /api/pedidos/exportar?q=&cliente=&de=&ate=&formato=csv|xlsx → visão filtrada da página Pedidos (RLS), até 5.000. */
export async function GET(req: NextRequest) {
  try {
    const ctx = await obterContexto();
    const { pedidos } = await listarPedidosFiltrados(ctx, Object.fromEntries(req.nextUrl.searchParams), { limite: 5000 });
    const linhas = pedidos.map((p) => [
      p.codigo_pedido, p.numero, formatarData(p.data), p.cliente?.nome ?? "", p.representada?.nome ?? "",
      ROTULO_STATUS_PEDIDO[p.status] ?? p.status, Number(p.valor_total), Number(p.comissao_total), p.tem_pendencias ? "Sim" : "",
    ]);
    const nome = `pedidos-${new Date().toISOString().slice(0, 10)}`;
    const cabecalhos = (tipo: string, ext: string) => ({
      "Content-Type": tipo,
      "Content-Disposition": `attachment; filename="${nome}.${ext}"`,
      "Cache-Control": "private, no-store",
    });
    if (req.nextUrl.searchParams.get("formato") === "xlsx") {
      return new NextResponse(gerarXlsx(CABECALHO, linhas, "Pedidos"), {
        headers: cabecalhos("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
      });
    }
    return new NextResponse(gerarCsv(CABECALHO, linhas), { headers: cabecalhos("text/csv; charset=utf-8", "csv") });
  } catch (e) {
    const erro = normalizarErro(e);
    return NextResponse.json({ erro: erro.message, codigo: erro.code }, { status: erro.status });
  }
}
