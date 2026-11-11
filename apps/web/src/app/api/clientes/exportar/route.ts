import { NextResponse, type NextRequest } from "next/server";
import { gerarCsv } from "@/lib/csv";
import { formatarData, formatarDocumento } from "@/lib/formato";
import { gerarXlsx } from "@/lib/planilha";
import { listarClientes } from "@/server/clientes";
import { obterContexto } from "@/server/contexto";
import { normalizarErro } from "@/server/erros";

const CABECALHO = [
  "Nome", "CNPJ/CPF", "E-mail", "Celular", "WhatsApp", "Cidade", "UF", "CEP", "Segmento", "Representadas", "Status", "Anotações", "Cadastrado em",
];

/** GET /api/clientes/exportar?formato=csv|xlsx → carteira de clientes do usuário (RLS), em CSV (padrão) ou XLSX. */
export async function GET(req: NextRequest) {
  try {
    const ctx = await obterContexto();
    const clientes = await listarClientes(ctx);
    const linhas = clientes.map((c) => [
      c.nome, c.documento ? formatarDocumento(c.documento) : "", c.email, c.celular, c.whatsapp, c.cidade, c.uf,
      c.cep ? c.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2") : "", c.segmento, c.representadas.map((r) => r.nome).join(", "),
      c.status === "inativo" ? "Inativo" : "Ativo", c.anotacoes, formatarData(c.criado_em),
    ]);
    const nome = `clientes-${new Date().toISOString().slice(0, 10)}`;
    const cabecalhos = (tipo: string, ext: string) => ({
      "Content-Type": tipo,
      "Content-Disposition": `attachment; filename="${nome}.${ext}"`,
      "Cache-Control": "private, no-store",
    });
    if (req.nextUrl.searchParams.get("formato") === "xlsx") {
      return new NextResponse(gerarXlsx(CABECALHO, linhas, "Clientes"), {
        headers: cabecalhos("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
      });
    }
    return new NextResponse(gerarCsv(CABECALHO, linhas), { headers: cabecalhos("text/csv; charset=utf-8", "csv") });
  } catch (e) {
    const erro = normalizarErro(e);
    return NextResponse.json({ erro: erro.message, codigo: erro.code }, { status: erro.status });
  }
}
