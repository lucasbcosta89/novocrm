import type { ConfiguracaoImportacao, ProblemaImportacao, Representada, ResultadoValidacaoLinha } from "./tipos";
import { CAMPOS_REPRESENTADA, type CampoRepresentada } from "./representada";
import { soDigitos } from "./normalizadores";
import { chaveImportacao } from "@/lib/importacao/motor";

/**
 * Configuração da importação de representadas (instância de ConfiguracaoImportacao). As regras de cada
 * campo são as MESMAS do formulário (CAMPOS_REPRESENTADA). Tudo que é específico da entidade fica aqui;
 * o motor e o componente de importação são genéricos.
 */

/** Cabeçalho do modelo — nomes EXATOS, nesta ordem (contrato). */
export const COLUNAS_REPRESENTADA = [
  "codigo_representada", "razao_social", "nome_fantasia", "cnpj", "inscricao_estadual", "email_comercial", "telefone",
  "contato_nome", "contato_telefone", "cep", "endereco", "numero", "complemento", "bairro", "cidade", "uf",
  "comissao_percentual", "prazo_pagamento_dias", "tabela_preco", "status", "observacoes",
] as const satisfies readonly CampoRepresentada[];

/**
 * Valores existentes na base (carregados pelo servidor, só leitura, RLS do usuário):
 * "cnpj:X" → representada cadastrada (código + valores atuais); "codigo_representada:X" / "inscricao_estadual:X" → dono.
 */
export type ExistenteRepresentada = { codigo: string; valores: Record<string, unknown> };

/** Linha com CNPJ já cadastrado e todos os campos preenchidos iguais ao cadastro: nada a gravar (ignorada). */
export function semAlteracaoRepresentada(dados: Record<string, string | number | null>, existente: unknown): boolean {
  const v = (existente as ExistenteRepresentada | undefined)?.valores;
  if (!v) return false;
  return Object.entries(dados).every(([campo, novo]) =>
    typeof novo === "number" ? Number(v[campo]) === novo : String(v[campo] ?? "") === String(novo ?? ""),
  );
}

/** Excel guarda CNPJ numérico sem os zeros à esquerda: completa até 14 dígitos. */
const cnpjDaCelula = (v: string) => {
  const d = soDigitos(v);
  return d.length >= 12 && d.length < 14 ? d.padStart(14, "0") : v;
};

function validarLinhaRepresentada(bruto: Record<string, string>, ctx: { linhasAnteriores: string[]; valoresExistentesNaBase: Map<string, unknown> }): ResultadoValidacaoLinha {
  const erros: ProblemaImportacao[] = [];
  const alertas: ProblemaImportacao[] = [];
  const dados: Record<string, string | number | null> = {};

  // só os campos PREENCHIDOS entram em `dados`: campo vazio nunca apaga dado existente
  for (const campo of COLUNAS_REPRESENTADA) {
    const recebido = bruto[campo] ?? "";
    if (!recebido) continue;
    const r = CAMPOS_REPRESENTADA[campo].safeParse(campo === "cnpj" ? cnpjDaCelula(recebido) : recebido);
    if (!r.success) erros.push({ campo, mensagem: r.error.issues[0]?.message ?? "Valor inválido", valor_recebido: recebido });
    else if (r.data != null) dados[campo] = r.data as string | number;
  }

  const cnpj = typeof dados.cnpj === "string" ? dados.cnpj : null;
  if (cnpj) {
    if (ctx.linhasAnteriores.includes(chaveImportacao("cnpj", cnpj))) {
      erros.push({ campo: "cnpj", mensagem: "CNPJ repetido no arquivo (já aparece em uma linha anterior)", valor_recebido: bruto.cnpj ?? null });
    }
    const existente = ctx.valoresExistentesNaBase.get(chaveImportacao("cnpj", cnpj)) as ExistenteRepresentada | undefined;
    if (existente && semAlteracaoRepresentada(dados, existente)) {
      alertas.push({ campo: "cnpj", mensagem: `Sem alterações: ${existente.codigo} já está igual no cadastro; a linha será ignorada`, valor_recebido: bruto.cnpj ?? null });
    } else if (existente) {
      alertas.push({
        campo: "cnpj",
        mensagem: `CNPJ já cadastrado (${existente.codigo}): os campos preenchidos vão atualizar a representada; os vazios mantêm o que já existe`,
        valor_recebido: bruto.cnpj ?? null,
      });
    }
  }

  // demais únicos por usuário: inscrição estadual (exceto ISENTO) e código
  const unicos: [CampoRepresentada, string][] = [["inscricao_estadual", "Inscrição estadual"], ["codigo_representada", "Código"]];
  for (const [campo, rotulo] of unicos) {
    const v = dados[campo];
    if (typeof v !== "string" || v === "ISENTO") continue;
    if (ctx.linhasAnteriores.includes(chaveImportacao(campo, v))) {
      erros.push({ campo, mensagem: `${rotulo} repetido no arquivo (já aparece em uma linha anterior)`, valor_recebido: bruto[campo] ?? null });
    }
    const dono = ctx.valoresExistentesNaBase.get(chaveImportacao(campo, v)) as { cnpj: string | null } | undefined;
    if (dono && dono.cnpj !== cnpj) {
      erros.push({ campo, mensagem: `${rotulo} já usado em outra representada cadastrada`, valor_recebido: bruto[campo] ?? null });
    }
  }

  return { numero_linha: 0, classificacao: "valida", dados, erros, alertas };
}

export const importacaoRepresentadas: ConfiguracaoImportacao<Representada> = {
  entidade: "representadas",
  colunasEsperadas: [...COLUNAS_REPRESENTADA],
  colunasObrigatorias: ["razao_social", "cnpj", "email_comercial", "cidade", "uf", "comissao_percentual"],
  chaveDedupe: "cnpj",
  chavesUnicas: ["inscricao_estadual", "codigo_representada"],
  maxLinhas: 5000,
  validarLinha: validarLinhaRepresentada,
  semAlteracao: semAlteracaoRepresentada,
  mensagens: {
    titulo: "Importar representadas",
    singular: "representada",
    plural: "representadas",
    obrigatorio: 'Campo obrigatório "{campo}" está vazio',
    chave: "CNPJ",
  },
  mensagemModelo:
    "Preencha uma representada por linha a partir da linha 2, sem mudar o cabeçalho (nomes e ordem das colunas). " +
    "Obrigatórios: razao_social, cnpj, email_comercial, cidade, uf, comissao_percentual. " +
    "CNPJ com ou sem máscara; comissão de 0 a 100 (vírgula ou ponto); status Ativa ou Inativa (vazio = Ativa); " +
    "codigo_representada vazio = gerado (REP-0001…). CNPJ já cadastrado: só os campos preenchidos são atualizados. " +
    "Apague a linha de exemplo antes de importar.",
  linhaExemplo: {
    codigo_representada: "", razao_social: "Exemplo Calçados Ltda", nome_fantasia: "Exemplo", cnpj: "11.222.333/0001-81",
    inscricao_estadual: "ISENTO", email_comercial: "contato@exemplo.com.br", telefone: "(11) 3333-4444", contato_nome: "Nome do Contato",
    contato_telefone: "(11) 99999-0000", cep: "01001-000", endereco: "Rua Exemplo", numero: "100", complemento: "Sala 1",
    bairro: "Centro", cidade: "São Paulo", uf: "SP", comissao_percentual: "5,5", prazo_pagamento_dias: "30",
    tabela_preco: "Tabela A", status: "Ativa", observacoes: "Linha de exemplo: apague antes de importar",
  },
};
