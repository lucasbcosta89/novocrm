import { NextResponse, type NextRequest } from "next/server";
import { lerArquivo } from "@/server/armazenamento";
import { obterContexto } from "@/server/contexto";
import { arquivoUpload } from "@/server/documentos-representada";
import { normalizarErro } from "@/server/erros";

/** Download de um upload do próprio usuário (sempre como anexo; nunca renderiza inline). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { chave, nome } = await arquivoUpload(await obterContexto(), (await params).id);
    const arq = await lerArquivo(chave);
    if (!arq) return NextResponse.json({ erro: "Arquivo não encontrado" }, { status: 404 });
    return new NextResponse(arq.bytes, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (e) {
    const erro = normalizarErro(e);
    return NextResponse.json({ erro: erro.message }, { status: erro.status });
  }
}
