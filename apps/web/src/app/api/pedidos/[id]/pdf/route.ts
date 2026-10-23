import { NextResponse, type NextRequest } from "next/server";
import { obterContexto } from "@/server/contexto";
import { pdfDoPedido } from "@/server/documentos";
import { normalizarErro } from "@/server/erros";
import { pdfParaEnvioWhatsApp } from "@/server/pedido-whatsapp";

const nomeArquivo = (nome: string) =>
  nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\.pdf$/i, "").replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").slice(0, 80) + ".pdf";

/**
 * GET /api/pedidos/[id]/pdf → download do PDF do pedido (gera ou reusa do cache; não consome pdf_mes).
 * ?envio=whatsapp → também registra o envio no histórico (clique do botão do WhatsApp).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await obterContexto();
    const { id } = await params;
    const pdf = req.nextUrl.searchParams.get("envio") === "whatsapp" ? await pdfParaEnvioWhatsApp(ctx, id) : await pdfDoPedido(ctx, id);
    return new NextResponse(new Uint8Array(pdf.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomeArquivo(pdf.nome)}"`,
        "Cache-Control": "private, no-store",
        "X-Pdf-Cache": pdf.cache ? "HIT" : "MISS",
      },
    });
  } catch (e) {
    const erro = normalizarErro(e);
    return NextResponse.json({ erro: erro.message, codigo: erro.code }, { status: erro.status });
  }
}
