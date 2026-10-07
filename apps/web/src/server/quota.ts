import { mesAtual, RECURSOS, RECURSOS_MENSAIS, type Limites, type Recurso } from "@/lib/planos";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

export type UsoRecurso = { usado: number; limite: number | null; atingido: boolean };
export type Uso = {
  plano: { codigo: string; nome: string; preco: number };
  mes: string;
  recursos: Record<Recurso, UsoRecurso>;
};

/** null/undefined = ilimitado. */
export function limiteAtingido(limite: number | null | undefined, usados: number): boolean {
  return limite != null && usados >= limite;
}

/**
 * Quota service: plano do usuário + contadores de `usage`.
 * Os contadores são mantidos por triggers no banco (incremento no INSERT, decremento no DELETE,
 * recursos mensais com chave YYYY-MM — "resetam" ao virar o mês). O banco também barra o excesso,
 * então nem um acesso direto ao PostgREST passa do limite.
 */
export async function obterUso({ supabase, userId }: Contexto): Promise<Uso> {
  const mes = mesAtual();
  const [usuario, usage] = await Promise.all([
    supabase
      .from("usuarios")
      .select("plano, planos(codigo, nome, preco, limites)")
      .eq("id", userId)
      .single<{ plano: string; planos: { codigo: string; nome: string; preco: number; limites: Partial<Limites> } | null }>(),
    supabase.from("usage").select("recurso, mes, contador").eq("user_id", userId).in("mes", ["total", mes]),
  ]);
  if (usuario.error) throw erroBanco(usuario.error);
  if (usage.error) throw erroBanco(usage.error);

  const plano = usuario.data.planos ?? { codigo: usuario.data.plano, nome: usuario.data.plano, preco: 0, limites: {} };
  const contadores = new Map(usage.data.map((u) => [`${u.recurso}|${u.mes}`, u.contador as number]));
  const recursos = Object.fromEntries(
    RECURSOS.map((r) => {
      const usado = contadores.get(`${r}|${RECURSOS_MENSAIS.includes(r) ? mes : "total"}`) ?? 0;
      const limite = plano.limites[r] ?? null;
      return [r, { usado, limite, atingido: limiteAtingido(limite, usado) }];
    }),
  ) as Record<Recurso, UsoRecurso>;

  return { plano: { codigo: plano.codigo, nome: plano.nome, preco: Number(plano.preco) }, mes, recursos };
}

/** Middleware de quota: chamado em todo POST de recurso limitado, antes de gravar. */
export async function verificarLimite(ctx: Contexto, recurso: Recurso): Promise<void> {
  const uso = await obterUso(ctx);
  const r = uso.recursos[recurso];
  if (r.atingido) {
    throw new AppError(
      403,
      `Limite do plano ${uso.plano.nome} atingido: ${r.limite} ${recurso.replace("_", " ")}. Faça upgrade para continuar.`,
      "LIMITE_ATINGIDO",
    );
  }
}
