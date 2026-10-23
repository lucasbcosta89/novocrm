import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { idSchema } from "@/lib/validacao";
import { lerArquivo } from "@/server/armazenamento";
import { linkPublicoValido } from "@/server/pedido-whatsapp";

/**
 * Download público de UM documento por link assinado (HMAC + validade de 7 dias), usado no envio do
 * pedido por wa.me quando a Cloud API não está configurada. Sem assinatura válida → 404.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = req.nextUrl.searchParams;
  const valido = idSchema.safeParse(id).success && (await linkPublicoValido(id, p.get("exp"), p.get("sig")));
  if (!valido) return NextResponse.json({ erro: "Link inválido ou expirado" }, { status: 404 });

  const { data } = await supabaseAdmin().from("documentos").select("r2_key, status, titulo").eq("id", id).maybeSingle<{ r2_key: string; status: string; titulo: string | null }>();
  if (!data || data.status !== "pronto") return NextResponse.json({ erro: "Documento indisponível" }, { status: 404 });
  const arq = await lerArquivo(data.r2_key);
  if (!arq) return NextResponse.json({ erro: "Documento indisponível" }, { status: 404 });
  const nome = `${(data.titulo ?? "documento").replace(/[^\p{L}\p{N} ._-]/gu, "-")}.pdf`;
  return new NextResponse(arq.bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
