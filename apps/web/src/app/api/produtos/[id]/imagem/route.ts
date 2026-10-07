import { NextResponse, type NextRequest } from "next/server";
import { lerArquivo } from "@/server/armazenamento";
import { obterContexto } from "@/server/contexto";
import { normalizarErro } from "@/server/erros";
import { obterProduto, salvarImagemProduto } from "@/server/produtos";

type P = { params: Promise<{ id: string }> };

function erroJson(e: unknown) {
  const erro = normalizarErro(e);
  return NextResponse.json({ erro: erro.message, codigo: erro.code }, { status: erro.status });
}

/** Imagem do produto (somente o dono). */
export async function GET(_req: NextRequest, { params }: P) {
  try {
    const p = await obterProduto(await obterContexto(), (await params).id);
    const arq = p.imagem_url ? await lerArquivo(p.imagem_url) : null;
    if (!arq) return NextResponse.json({ erro: "Sem imagem" }, { status: 404 });
    return new NextResponse(arq.bytes, { headers: { "Content-Type": arq.contentType, "Cache-Control": "private, max-age=86400" } });
  } catch (e) {
    return erroJson(e);
  }
}

/** multipart/form-data com campo "imagem" (JPEG/PNG até 2 MB). */
export async function POST(req: NextRequest, { params }: P) {
  try {
    const arquivo = (await req.formData()).get("imagem");
    return NextResponse.json(await salvarImagemProduto(await obterContexto(), (await params).id, arquivo));
  } catch (e) {
    return erroJson(e);
  }
}
