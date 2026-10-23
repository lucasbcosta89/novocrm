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

/* ---------- Pedido em PDF por wa.me (Fase 12b) ---------- */

// espaço comum no lugar do NBSP do Intl (texto mais limpo na URL e no WhatsApp)
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v).replace(/\u00a0/g, " ");

/** Mensagem pré-preenchida (editável no WhatsApp). */
export const mensagemPedido = (cliente: string, numero: string, total: number) =>
  `Olá, ${cliente}! Segue o pedido nº ${numero}, no valor de ${brl(total)}. O PDF está em anexo.`;

/**
 * Link wa.me do pedido: número só com dígitos e DDI 55 (DDD + 8 ou 9 dígitos).
 * Sem telefone ou número inválido → motivo para desabilitar o botão.
 */
export function linkPedidoWhatsApp(telefone: string | null | undefined, cliente: string, numero: string, total: number):
  { url: string; contato: string } | { motivo: string } {
  if (!telefone?.replace(/\D/g, "")) return { motivo: "Cliente sem telefone cadastrado" };
  const contato = normalizarTelefone(telefone);
  if (!contato) return { motivo: "Telefone do cliente inválido (use DDD + número)" };
  return { contato, url: linkWhatsApp(contato, mensagemPedido(cliente, numero, total)) };
}
