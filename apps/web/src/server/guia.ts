import { VERIFICACOES, type VerificacaoId } from "@/lib/guia/conteudo";
import type { Contexto } from "./contexto";
import { erroBanco } from "./erros";

/**
 * Fase 23.1 (C) — diagnóstico de completude AO VIVO: 5 verificações somente leitura, com a sessão do usuário (RLS),
 * nunca service role. Base vazia = todas pendentes (0%). Nunca bloqueia nada.
 */
export type ResultadoDiagnostico = { verificacoes: { id: VerificacaoId; ok: boolean }[]; percentual: number };

export async function diagnosticoGuia({ supabase }: Contexto): Promise<ResultadoDiagnostico> {
  const [reps, produtos, faturados, pedidos, semPrazo] = await Promise.all([
    supabase.from("representadas").select("id, comissao_percentual, comissao_pagamento_tipo, comissao_pagamento_referencia, comissao_pagamento_dias")
      .is("excluido_em", null).limit(5000)
      .returns<{ id: string; comissao_percentual: number | null; comissao_pagamento_tipo: string | null; comissao_pagamento_referencia: string | null; comissao_pagamento_dias: number | null }[]>(),
    supabase.from("produtos").select("comissao, representada_id").eq("ativo", true).limit(50_000).returns<{ comissao: number | null; representada_id: string }[]>(),
    supabase.from("pedidos").select("id", { count: "exact", head: true }).not("data_faturamento", "is", null),
    supabase.from("pedidos").select("id", { count: "exact", head: true }),
    supabase.from("comissoes").select("id", { count: "exact", head: true }).contains("motivos_pendencia", ["sem_prazo_cliente"]),
  ]);
  for (const r of [reps, produtos, faturados, pedidos, semPrazo]) if (r.error) throw erroBanco(r.error);

  const representadas = reps.data ?? [];
  const comComissao = new Set(representadas.filter((r) => Number(r.comissao_percentual ?? 0) > 0).map((r) => r.id));
  const ativos = produtos.data ?? [];
  const resultado: Record<VerificacaoId, boolean> = {
    representada_comissao: comComissao.size > 0,
    produtos_comissao: ativos.length > 0 && ativos.every((p) => Number(p.comissao ?? 0) > 0 || comComissao.has(p.representada_id)),
    pedido_faturamento: (faturados.count ?? 0) > 0,
    pagamento_comissao: representadas.some((r) => !!r.comissao_pagamento_tipo && (r.comissao_pagamento_tipo !== "outro" || (r.comissao_pagamento_dias != null && !!r.comissao_pagamento_referencia))),
    prazo_cliente: (pedidos.count ?? 0) > 0 && (semPrazo.count ?? 0) === 0,
  };
  const verificacoes = VERIFICACOES.map((v) => ({ id: v.id, ok: resultado[v.id] }));
  return { verificacoes, percentual: Math.round((verificacoes.filter((v) => v.ok).length / verificacoes.length) * 100) };
}
