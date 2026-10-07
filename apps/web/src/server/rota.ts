import { NextResponse, type NextRequest } from "next/server";
import { obterContexto, type Contexto } from "./contexto";
import { AppError, normalizarErro } from "./erros";

type Params = Record<string, string>;
type Handler<P extends Params> = (ctx: Contexto, args: { req: NextRequest; params: P }) => Promise<unknown>;

export async function lerJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError(400, "JSON inválido", "json_invalido");
  }
}

/** Handler de API: autentica, executa, serializa e converte erros em JSON {erro, codigo}. */
export function rota<P extends Params = Params>(handler: Handler<P>, statusOk = 200) {
  return async (req: NextRequest, { params }: { params: Promise<P> }) => {
    try {
      const ctx = await obterContexto();
      const resultado = await handler(ctx, { req, params: await params });
      return resultado === undefined ? new NextResponse(null, { status: 204 }) : NextResponse.json(resultado, { status: statusOk });
    } catch (e) {
      const erro = normalizarErro(e);
      const upgrade = erro.code === "LIMITE_ATINGIDO" ? { upgrade: true } : {};
      return NextResponse.json({ erro: erro.message, codigo: erro.code, ...upgrade }, { status: erro.status });
    }
  };
}
