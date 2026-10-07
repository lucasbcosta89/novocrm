import { NextResponse, type NextRequest } from "next/server";
import { lerArquivo } from "@/server/armazenamento";
import { obterContexto } from "@/server/contexto";
import { arquivoDocumento } from "@/server/documentos";
import { normalizarErro } from "@/server/erros";

const nomeArquivo = (titulo: string) =>
  titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").slice(0, 80) + ".pdf";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await obterContexto();
    const { chave, titulo } = await arquivoDocumento(ctx, (await params).id);
    const arquivo = await lerArquivo(chave);
    if (!arquivo) return NextResponse.json({ erro: "Arquivo não encontrado" }, { status: 404 });
    return new NextResponse(arquivo.bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomeArquivo(titulo)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    const erro = normalizarErro(e);
    return NextResponse.json({ erro: erro.message, codigo: erro.code }, { status: erro.status });
  }
}
