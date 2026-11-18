import { calcularAcesso, diasAte, type EstadoAcesso } from "@/lib/planos";
import type { Contexto } from "./contexto";
import { erroBanco } from "./erros";

/**
 * Paywall: estado de acesso do usuário (trial de 7 dias → assinante → carência → somente leitura). A regra que vale é a
 * do banco (função acesso_usuario + gatilho exigir_assinatura); aqui só se monta o aviso da tela.
 */
export type Acesso = { estado: EstadoAcesso; trialFim: string | null; diasTrial: number; periodoFim: string | null };

export async function obterAcesso({ supabase, userId }: Contexto): Promise<Acesso> {
  const [u, a] = await Promise.all([
    supabase.from("usuarios").select("trial_fim").eq("id", userId).maybeSingle<{ trial_fim: string | null }>(),
    supabase.from("assinaturas").select("status, periodo_fim").eq("user_id", userId).maybeSingle<{ status: string; periodo_fim: string | null }>(),
  ]);
  if (u.error) throw erroBanco(u.error);
  if (a.error) throw erroBanco(a.error);
  const trialFim = u.data?.trial_fim ?? null;
  return {
    estado: calcularAcesso({ trial_fim: trialFim, assinatura: a.data ?? null }),
    trialFim, diasTrial: diasAte(trialFim), periodoFim: a.data?.periodo_fim ?? null,
  };
}
