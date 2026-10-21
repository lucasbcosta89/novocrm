/** Contadores do log de oportunidades: aproveitamento = ganhas ÷ (ganhas + perdidas) × 100. */
export function resumoOportunidades(itens: { resultado: string | null }[]) {
  const ganhas = itens.filter((o) => o.resultado === "ganhou").length;
  const perdidas = itens.filter((o) => o.resultado === "perdeu").length;
  const decididas = ganhas + perdidas;
  return { total: itens.length, ganhas, perdidas, aproveitamento: decididas ? Math.round((ganhas / decididas) * 1000) / 10 : 0 };
}

export type NivelAlerta = "vermelho" | "amarelo" | "verde";
type TarefaAlerta = { status: string; descricao?: string; prazo?: string | null };

const PENDENTE = (t: TarefaAlerta) => t.status !== "concluido" && t.status !== "cancelado";
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/**
 * Faixa do card a partir das sub-tarefas (hoje = AAAA-MM-DD, fuso de Brasília):
 * vermelho = tarefa pendente com prazo vencido; amarelo = pendente vencendo nos próximos 7 dias;
 * verde = há tarefas e todas em dia; null = sem tarefas (sem faixa).
 */
export function alertaTarefas(tarefas: TarefaAlerta[], hoje: string): { nivel: NivelAlerta; mensagem: string } | null {
  if (tarefas.length === 0) return null;
  const pendentes = tarefas.filter((t) => PENDENTE(t) && t.prazo).sort((a, b) => a.prazo!.localeCompare(b.prazo!));
  const vencidas = pendentes.filter((t) => t.prazo! < hoje);
  if (vencidas.length) {
    return { nivel: "vermelho", mensagem: vencidas.map((t) => `Tarefa "${t.descricao ?? "sem descrição"}" vencida em ${ddmm(t.prazo!)}`).join("\n") };
  }
  const limite = somarDias(hoje, 7);
  const vencendo = pendentes.filter((t) => t.prazo! <= limite);
  if (vencendo.length) {
    return { nivel: "amarelo", mensagem: vencendo.map((t) => `Tarefa "${t.descricao ?? "sem descrição"}" vence em ${ddmm(t.prazo!)}`).join("\n") };
  }
  return { nivel: "verde", mensagem: "Todas as tarefas em dia" };
}
