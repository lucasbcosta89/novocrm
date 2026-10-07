/** Utilitários puros do WhatsApp (testáveis, sem I/O). */

/** Telefone BR → formato E.164 sem "+": 5511999998888. null se inválido. */
export function normalizarTelefone(valor: string | null | undefined): string | null {
  const d = (valor ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

/** Substitui {{1}}, {{2}}… pelos parâmetros (mesma numeração dos templates da Meta). */
export function renderizarTemplate(corpo: string, params: string[]): string {
  return corpo.replace(/\{\{(\d+)\}\}/g, (m, n: string) => params[Number(n) - 1] ?? m);
}

export const linkWhatsApp = (telefone: string, texto: string) => `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}`;

/** Custo estimado por conversa (R$) — referência de preço da Meta para o Brasil; o valor real vem na fatura. */
export const CUSTO_CONVERSA: Record<string, number> = { marketing: 0.35, utility: 0.05, authentication: 0.05, service: 0 };

/** Janela de atendimento: mensagem livre só até 24h após a última mensagem do cliente. */
export const JANELA_MS = 24 * 60 * 60 * 1000;
export function dentroDaJanela(ultimaEntrada: string | null, agora = new Date()): boolean {
  return ultimaEntrada != null && agora.getTime() - new Date(ultimaEntrada).getTime() < JANELA_MS;
}
