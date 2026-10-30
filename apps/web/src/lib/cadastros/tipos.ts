/**
 * Contratos compartilhados dos cadastros (Representadas; depois Clientes e Pedidos) e da importação
 * genérica por planilha. Tipos puros: importáveis por front, servidor e testes.
 */

export type StatusRepresentada = "ativa" | "inativa";

export interface Representada {
  id: string;
  codigo_representada: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;                      // armazenado sem máscara (null só em cadastros antigos ainda não completados)
  inscricao_estadual: string | null;
  email_comercial: string;
  telefone: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  comissao_percentual: number;
  prazo_pagamento_dias: number | null;
  tabela_preco: string | null;
  status: StatusRepresentada;
  observacoes: string | null;
  clientes_vinculados: number;       // derivado na listagem
  valor_vendido_90d: number;         // derivado na listagem
  criado_em: string;
  atualizado_em: string;
  excluido_em: string | null;        // exclusão lógica
}

/** Linha da tabela `representadas` (sem os derivados da listagem). */
export type RegistroRepresentada = Omit<Representada, "clientes_vinculados" | "valor_vendido_90d">;

export type ClassificacaoLinha = "valida" | "com_alerta" | "invalida";

export interface ProblemaImportacao {
  campo: string;
  mensagem: string;
  valor_recebido: string | null;
}

export interface ResultadoValidacaoLinha {
  numero_linha: number;              // número da linha no arquivo, contando o cabeçalho
  classificacao: ClassificacaoLinha;
  dados: Record<string, string | number | null>;  // dados normalizados
  erros: ProblemaImportacao[];       // impedem gravação
  alertas: ProblemaImportacao[];     // não impedem gravação
}

export interface RelatorioImportacao {
  entidade: string;
  total_linhas: number;
  validas: number;
  com_alerta: number;
  invalidas: number;
  inseridas: number;
  atualizadas: number;
  ignoradas: number;
  linhas: ResultadoValidacaoLinha[];  // todas, para a tela de conferência
  arquivo_nome: string;
  iniciado_em: string;
  concluido_em: string;
}

export interface ContextoValidacao {
  linhasAnteriores: string[];        // para detectar duplicidade dentro do arquivo
  valoresExistentesNaBase: Map<string, unknown>; // para deduplicação contra a base
}

export interface ConfiguracaoImportacao<T> {
  entidade: string;
  colunasEsperadas: string[];        // cabeçalho é contrato
  colunasObrigatorias: string[];
  chaveDedupe: keyof T;
  maxLinhas: number;
  validarLinha: (bruto: Record<string, string>, contexto: ContextoValidacao) => ResultadoValidacaoLinha;
  mensagens: Record<string, string>;
  mensagemModelo: string;            // texto do arquivo modelo para download
}
