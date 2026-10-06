import "server-only";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { obterContexto, type Contexto } from "./contexto";
import { comParam } from "@/lib/url";
import { normalizarErro } from "./erros";

/**
 * Server action padrão: executa com a sessão do usuário e redireciona.
 * Sucesso → destinoOk (string ou função do resultado) com ?ok=; erro → destinoErro com ?erro=.
 */
export async function executarAcao<T>(
  fn: (ctx: Contexto) => Promise<T>,
  opts: { ok: string | ((r: T) => string); erro: string; mensagem?: string },
): Promise<never> {
  let destino: string;
  try {
    const resultado = await fn(await obterContexto());
    destino = typeof opts.ok === "function" ? opts.ok(resultado) : opts.ok;
    if (opts.mensagem) destino = comParam(destino, "ok", opts.mensagem);
  } catch (e) {
    unstable_rethrow(e); // erros internos do Next (dynamic usage, redirect, notFound)
    const erro = normalizarErro(e);
    if (erro.status === 401) redirect("/login");
    destino = comParam(opts.erro, "erro", erro.message);
  }
  redirect(destino);
}

/** Carrega dados para Server Components; 404 vira notFound(). */
export async function carregar<T>(fn: (ctx: Contexto) => Promise<T>): Promise<T> {
  try {
    return await fn(await obterContexto());
  } catch (e) {
    unstable_rethrow(e); // erros internos do Next (dynamic usage, redirect, notFound)
    const erro = normalizarErro(e);
    if (erro.status === 404 || erro.code === "validacao") notFound();
    if (erro.status === 401) redirect("/login");
    throw erro;
  }
}
