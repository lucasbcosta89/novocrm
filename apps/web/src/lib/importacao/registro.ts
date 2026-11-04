import type { ConfiguracaoImportacao } from "@/lib/cadastros/tipos";
import { importacaoClientes } from "@/lib/cadastros/importacao-clientes";
import { importacaoPedidos } from "@/lib/cadastros/importacao-pedidos";
import { importacaoRepresentadas } from "@/lib/cadastros/importacao-representadas";

/**
 * Registro das importações disponíveis. Para Clientes e Pedidos: criar a ConfiguracaoImportacao da
 * entidade e registrá-la aqui (e o adaptador de gravação em server/importacao.ts) — o componente e o motor
 * não mudam.
 */
const REGISTRO = {
  representadas: importacaoRepresentadas,
  clientes: importacaoClientes,
  pedidos: importacaoPedidos,
};

export type EntidadeImportacao = keyof typeof REGISTRO;

/**
 * Vista genérica das configurações: motor e tela só tratam a chave de dedupe como nome de campo (keyof T vira
 * string). A conversão é segura porque nenhuma outra parte da configuração depende de T.
 */
export const IMPORTACOES = REGISTRO as unknown as Record<EntidadeImportacao, ConfiguracaoImportacao<Record<string, unknown>>>;
export const ehEntidadeImportacao = (e: string): e is EntidadeImportacao => e in IMPORTACOES;
