import { NextResponse, type NextRequest } from "next/server";
import { formatarDia } from "@/lib/formato";
import { gerarXlsx } from "@/lib/planilha";
import { obterContexto } from "@/server/contexto";
import { normalizarErro } from "@/server/erros";
import { listarDevolucoesImportadas } from "@/server/estornos";

const CABECALHO = ["Nº", "Pedido", "Representada", "Cliente", "SKU", "Descrição", "Quantidade", "Valor (R$)", "Comissão estornada (R$)", "Origem", "Data da devolução", "Data de processamento"];

/** H.4 — relatório de devoluções (mesmo filtro da visão), com linha de total. */
export async function GET(req: NextRequest) {
  try {
    const r = await listarDevolucoesImportadas(await obterContexto(), Object.fromEntries(req.nextUrl.searchParams));
    const linhas: (string | number)[][] = r.linhas.map((d) => [
      d.numero, d.pedido?.codigo_pedido ?? d.codigo_pedido_informado ?? "", d.representada?.nome ?? "", d.cliente?.nome ?? "", d.sku_informado ?? "",
      d.descricao_informada ?? "", Number(d.quantidade ?? 0), Number(d.valor_total), -Number(d.comissao_estornada), d.chave_unica ? "Excel" : "Manual",
      formatarDia(d.data), d.data_processamento ? formatarDia(d.data_processamento) : "",
    ]);
    linhas.push(["Total", "", "", "", "", "", "", r.totais.valor_total, -r.totais.comissao_estornada, "", "", ""]);
    return new NextResponse(gerarXlsx(CABECALHO, linhas, "Devoluções"), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="devolucoes-${new Date().toISOString().slice(0, 10)}.xlsx"`, "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const erro = normalizarErro(e);
    return NextResponse.json({ erro: erro.message, codigo: erro.code }, { status: erro.status });
  }
}
