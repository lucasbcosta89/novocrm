import { NextResponse, type NextRequest } from "next/server";
import { gerarCsv } from "@/lib/csv";
import { formatarDocumento } from "@/lib/formato";
import { obterContexto } from "@/server/contexto";
import { normalizarErro } from "@/server/erros";
import { listarRepresentadasListagem } from "@/server/representadas";

/** GET /api/representadas/exportar?q=&status=&uf=&ordem=&dir= → CSV da visão filtrada (sem paginação, RLS do usuário). */
export async function GET(req: NextRequest) {
  try {
    const ctx = await obterContexto();
    const { linhas } = await listarRepresentadasListagem(ctx, Object.fromEntries(req.nextUrl.searchParams), { paginar: false });
    const csv = gerarCsv(
      ["Código", "Razão social", "Nome fantasia", "CNPJ", "Cidade", "UF", "Comissão fixa (%)", "Status", "Clientes vinculados", "Vendido 90 dias (R$)"],
      linhas.map((r) => [
        r.codigo_representada, r.razao_social, r.nome_fantasia, formatarDocumento(r.cnpj), r.cidade, r.uf,
        r.comissao_percentual, r.status === "ativa" ? "Ativa" : "Inativa", r.clientes_vinculados, r.valor_vendido_90d,
      ]),
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="representadas-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const erro = normalizarErro(e);
    return NextResponse.json({ erro: erro.message, codigo: erro.code }, { status: erro.status });
  }
}
