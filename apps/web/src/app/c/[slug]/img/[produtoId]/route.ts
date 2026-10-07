import { NextResponse, type NextRequest } from "next/server";
import { lerArquivo } from "@/server/armazenamento";
import { imagemProdutoPublico } from "@/server/catalogo-publico";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; produtoId: string }> }) {
  const { slug, produtoId } = await params;
  const chave = await imagemProdutoPublico(slug, produtoId);
  const arq = chave ? await lerArquivo(chave) : null;
  if (!arq) return new NextResponse(null, { status: 404 });
  return new NextResponse(arq.bytes, { headers: { "Content-Type": arq.contentType, "Cache-Control": "public, max-age=3600" } });
}
