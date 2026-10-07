import { after, NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { criarPedidoPublico } from "@/server/catalogo-publico";
import { normalizarErro } from "@/server/erros";
import { enviarConfirmacaoPedido, whatsappConfigurado } from "@/server/whatsapp";

/** Pedido do catálogo público (sem login). Chega no CRM como rascunho, origem catalogo_web; confirmação via WhatsApp. */
export async function POST(req: NextRequest) {
  try {
    const r = await criarPedidoPublico(await req.json().catch(() => null));
    if (whatsappConfigurado()) {
      after(() =>
        enviarConfirmacaoPedido(supabaseAdmin(), r.user_id, r.pedido_id).catch((e) => console.error("confirmação WhatsApp", e)),
      );
    }
    return NextResponse.json({ numero: r.numero, valor_total: r.valor_total, whatsapp: whatsappConfigurado() }, { status: 201 });
  } catch (e) {
    const erro = normalizarErro(e);
    return NextResponse.json({ erro: erro.message }, { status: erro.status });
  }
}
