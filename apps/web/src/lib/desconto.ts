/**
 * Fase 17.1 (F) — desconto máximo em CASCATA. Espelho da função SQL resolver_desconto_max (formulário, importação e
 * recálculo de alertas usam a MESMA ordem). A checagem NUNCA deixa de rodar:
 *  1. produto: desconto máximo da tabela de preços (tabela do cliente > padrão), se > 0;
 *  2. representada: representadas.desconto_max, se > 0;
 *  3. configuração global do usuário: usuarios.desconto_max_padrao;
 *  4. padrão 10.
 * Item sem produto vinculado pula o nível 1 (usa representada e depois global).
 */
export const DESCONTO_MAX_PADRAO = 10;

const positivo = (v: number | null | undefined): v is number => v != null && Number(v) > 0;

export function resolverDescontoMaximo(
  produto: { desconto_max: number | null | undefined } | null | undefined,
  representada: { desconto_max: number | null | undefined } | null | undefined,
  configuracao: { desconto_max_padrao: number | null | undefined } | null | undefined,
): number {
  if (positivo(produto?.desconto_max)) return Number(produto.desconto_max);
  if (positivo(representada?.desconto_max)) return Number(representada.desconto_max);
  if (configuracao?.desconto_max_padrao != null) return Number(configuracao.desconto_max_padrao);
  return DESCONTO_MAX_PADRAO;
}
