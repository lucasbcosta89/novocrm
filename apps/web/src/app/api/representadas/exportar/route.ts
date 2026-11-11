import { NextResponse, type NextRequest } from "next/server";
import { gerarCsv } from "@/lib/csv";
import { formatarDocumento } from "@/lib/formato";
import { gerarXlsx } from "@/lib/planilha";
import { obterContexto } from "@/server/contexto";
import { normalizarErro } from "@/server/erros";
import { listarRepresentadasListagem } from "@/server/representadas";

const CABECALHO = ["Código", "Razão social", "Nome fantasia", "CNPJ", "Cidade", "UF", "Comissão fixa (%)", "Status", "Clientes vinculados", "Vendido 90 dias (R$)"];

/**
 * GET /api/representadas/exportar?q=&status=&uf=&ordem=&dir=&formato=csv|xlsx → visão filtrada da listagem
 * (sem paginação, RLS do usuário), em CSV (padrão) ou XLSX.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await obterContexto();
    const { linhas } = await listarRepresentadasListagem(ctx, Object.fromEntries(req.nextUrl.searchParams), { paginar: false });
    const dados = linhas.map((r) => [
      r.codigo_representada, r.razao_social, r.nome_fantasia, formatarDocumento(r.cnpj), r.cidade, r.uf,
      r.comissao_percentual, r.status === "ativa" ? "Ativa" : "Inativa", r.clientes_vinculados, r.valor_vendido_90d,
    ]);
    const nome = `representadas-${new Date().toISOString().slice(0, 10)}`;
    const cabecalhos = (tipo: string, ext: string) => ({
      "Content-Type": tipo,
      "Content-Disposition": `attachment; filename="${nome}.${ext}"`,
      "Cache-Control": "private, no-store",
    });
    if (req.nextUrl.searchParams.get("formato") === "xlsx") {
      return new NextResponse(gerarXlsx(CABECALHO, dados, "Representadas"), {
        headers: cabecalhos("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
      });
    }
    return new NextResponse(gerarCsv(CABECALHO, dados), { headers: cabecalhos("text/csv; charset=utf-8", "csv") });
  } catch (e) {
    const erro = normalizarErro(e);
    return NextResponse.json({ erro: erro.message, codigo: erro.code }, { status: erro.status });
  }
}
