import { NextResponse, type NextRequest } from "next/server";
import { gerarCsv } from "@/lib/csv";
import { formatarDia } from "@/lib/formato";
import { gerarXlsx } from "@/lib/planilha";
import { ROTULOS_COMPLETUDE, ROTULOS_ORIGEM, ROTULOS_TIPO, rotuloStatus } from "@/lib/comissoes/status";
import { comissoesParaExportar } from "@/server/comissoes";
import { obterContexto } from "@/server/contexto";
import { normalizarErro } from "@/server/erros";

/** N.5 — colunas da exportação de comissões. Produto ausente = descrição informada (N.6), nunca célula vazia. */
const CABECALHO = [
  "Pedido", "Cliente", "Representada", "Produto ou descrição informada", "Valor base (R$)", "Percentual (%)", "Comissão (R$)", "Status", "Completude",
  "Origem do cálculo", "Previsão de recebimento", "Data de recebimento", "Editada manualmente", "Lote de aprovação",
  "Tipo", "Devolução vinculada", "Data da devolução", "Data de processamento",
];

/** GET /api/comissoes/exportar?<filtro da página>&formato=csv|xlsx → exatamente a visão filtrada (RLS), até 10.000. */
export async function GET(req: NextRequest) {
  try {
    const ctx = await obterContexto();
    const comissoes = await comissoesParaExportar(ctx, Object.fromEntries(req.nextUrl.searchParams));
    const linhas = comissoes.map((c) => {
      const produtos = (c.pedido?.itens ?? []).map((i) => i.produto?.nome ?? i.descricao_informada ?? i.descricao ?? "Item sem descrição").join("; ");
      return [
        c.pedido?.codigo_pedido ?? "", c.pedido?.cliente?.nome ?? "", c.representada?.nome ?? "", produtos || "Item sem descrição",
        Number(c.pedido?.valor_total ?? 0), Number(c.percentual), Number(c.valor), rotuloStatus(c.status),
        ROTULOS_COMPLETUDE[c.completude] ?? c.completude, c.origem_calculo ? ROTULOS_ORIGEM[c.origem_calculo] : "",
        c.data_prevista_recebimento ? formatarDia(c.data_prevista_recebimento) : "Sem previsão", c.data_recebimento ? formatarDia(c.data_recebimento) : "",
        c.data_recebimento_editada ? "Sim" : "Não", c.lote_aprovacao_id ?? "",
        ROTULOS_TIPO[c.tipo], c.devolucao?.numero ?? "", c.devolucao ? formatarDia(c.devolucao.data) : "",
        c.devolucao?.data_processamento ? formatarDia(c.devolucao.data_processamento) : "",
      ];
    });
    const nome = `comissoes-${new Date().toISOString().slice(0, 10)}`;
    const cabecalhos = (tipo: string, ext: string) => ({
      "Content-Type": tipo, "Content-Disposition": `attachment; filename="${nome}.${ext}"`, "Cache-Control": "private, no-store",
    });
    if (req.nextUrl.searchParams.get("formato") === "xlsx") {
      return new NextResponse(gerarXlsx(CABECALHO, linhas, "Comissões"), {
        headers: cabecalhos("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
      });
    }
    return new NextResponse(gerarCsv(CABECALHO, linhas), { headers: cabecalhos("text/csv; charset=utf-8", "csv") });
  } catch (e) {
    const erro = normalizarErro(e);
    return NextResponse.json({ erro: erro.message, codigo: erro.code }, { status: erro.status });
  }
}
