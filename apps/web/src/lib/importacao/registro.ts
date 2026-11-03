import type { ConfiguracaoImportacao } from "@/lib/cadastros/tipos";
import { importacaoRepresentadas } from "@/lib/cadastros/importacao-representadas";

/**
 * Registro das importações disponíveis. Para Clientes e Pedidos: criar a ConfiguracaoImportacao da
 * entidade e registrá-la aqui (e o adaptador de gravação em server/importacao.ts) — o componente e o motor
 * não mudam.
 */
export const IMPORTACOES = {
  representadas: importacaoRepresentadas,
} satisfies Record<string, ConfiguracaoImportacao<never>>;

export type EntidadeImportacao = keyof typeof IMPORTACOES;
export const ehEntidadeImportacao = (e: string): e is EntidadeImportacao => e in IMPORTACOES;
