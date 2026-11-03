import type { ConfiguracaoImportacao, ProblemaImportacao, ResultadoValidacaoLinha } from "./tipos";
import { soDigitos } from "./normalizadores";
import { chaveImportacao } from "@/lib/importacao/motor";
import { clienteSchema } from "@/lib/validacao";

/**
 * Configuração da importação de clientes (Fase 16) — mesma base da importação de representadas: motor e tela
 * genéricos; aqui só o que é do cliente. Campos = cadastro atual de clientes (as regras de cada campo são as do
 * clienteSchema, as mesmas do formulário). Sem código e sem representada: o vínculo com representadas é feito
 * na plataforma. O CNPJ/CPF é obrigatório e é a chave de deduplicação (único por usuário).
 */

/** Cabeçalho do modelo — nomes EXATOS, nesta ordem (contrato). Coluna → campo do cadastro. */
export const COLUNAS_CLIENTE = {
  nome: "nome",
  cnpj_cpf: "documento",
  email: "email",
  celular: "celular",
  whatsapp: "whatsapp",
  cidade: "cidade",
  uf: "uf",
  cep: "cep",
  segmento: "segmento",
  anotacoes: "anotacoes",
} as const satisfies Record<string, keyof typeof clienteSchema.shape>;
type Coluna = keyof typeof COLUNAS_CLIENTE;
const COLUNAS = Object.keys(COLUNAS_CLIENTE) as Coluna[];

/** Cliente já cadastrado (pelo CNPJ/CPF): nome + valores atuais, lidos pelo servidor com RLS. */
export type ExistenteCliente = { nome: string; valores: Record<string, unknown> };

/** Excel guarda CNPJ/CPF numérico sem os zeros à esquerda: completa CPF (10 → 11) e CNPJ (12/13 → 14). */
function documentoDaCelula(v: string) {
  const d = soDigitos(v);
  if (d.length === 10) return d.padStart(11, "0");
  if (d.length === 12 || d.length === 13) return d.padStart(14, "0");
  return v;
}

/** Linha com CNPJ/CPF já cadastrado e todos os campos preenchidos iguais ao cadastro: nada a gravar (ignorada). */
export function semAlteracaoCliente(dados: Record<string, string | number | null>, existente: unknown): boolean {
  const v = (existente as ExistenteCliente | undefined)?.valores;
  if (!v) return false;
  return Object.entries(dados).every(([campo, novo]) => String(v[campo] ?? "") === String(novo ?? ""));
}

function validarLinhaCliente(bruto: Record<string, string>, ctx: { linhasAnteriores: string[]; valoresExistentesNaBase: Map<string, unknown> }): ResultadoValidacaoLinha {
  const erros: ProblemaImportacao[] = [];
  const alertas: ProblemaImportacao[] = [];
  const dados: Record<string, string | number | null> = {};

  // só os campos PREENCHIDOS entram em `dados`: campo vazio nunca apaga dado existente
  for (const coluna of COLUNAS) {
    const recebido = bruto[coluna] ?? "";
    if (!recebido) continue;
    const campo = COLUNAS_CLIENTE[coluna];
    const r = clienteSchema.shape[campo].safeParse(campo === "documento" ? documentoDaCelula(recebido) : recebido);
    if (!r.success) erros.push({ campo: coluna, mensagem: r.error.issues[0]?.message ?? "Valor inválido", valor_recebido: recebido });
    else if (r.data != null) dados[campo] = r.data as string;
  }

  const documento = typeof dados.documento === "string" ? dados.documento : null;
  if (documento) {
    if (ctx.linhasAnteriores.includes(chaveImportacao("documento", documento))) {
      erros.push({ campo: "cnpj_cpf", mensagem: "CNPJ/CPF repetido no arquivo (já aparece em uma linha anterior)", valor_recebido: bruto.cnpj_cpf ?? null });
    }
    const existente = ctx.valoresExistentesNaBase.get(chaveImportacao("documento", documento)) as ExistenteCliente | undefined;
    if (existente && semAlteracaoCliente(dados, existente)) {
      alertas.push({ campo: "cnpj_cpf", mensagem: `Sem alterações: o cliente "${existente.nome}" já está igual no cadastro; a linha será ignorada`, valor_recebido: bruto.cnpj_cpf ?? null });
    } else if (existente) {
      alertas.push({
        campo: "cnpj_cpf",
        mensagem: `CNPJ/CPF já cadastrado (cliente "${existente.nome}"): os campos preenchidos vão atualizar o cliente; os vazios mantêm o que já existe`,
        valor_recebido: bruto.cnpj_cpf ?? null,
      });
    }
  }

  return { numero_linha: 0, classificacao: "valida", dados, erros, alertas };
}

export const importacaoClientes: ConfiguracaoImportacao<{ documento: string }> = {
  entidade: "clientes",
  colunasEsperadas: [...COLUNAS],
  colunasObrigatorias: ["nome", "cnpj_cpf"],
  chaveDedupe: "documento",
  maxLinhas: 5000,
  validarLinha: validarLinhaCliente,
  semAlteracao: semAlteracaoCliente,
  mensagens: {
    titulo: "Cadastrar clientes com Excel",
    singular: "cliente",
    plural: "clientes",
    obrigatorio: 'Campo obrigatório "{campo}" está vazio',
    chave: "CNPJ/CPF",
    notaModelo:
      "Representadas não entram na planilha: depois de importar, vincule cada cliente às representadas dentro da " +
      "plataforma (página do cliente → aba Representadas). Clientes sem vínculo podem ser importados normalmente.",
  },
  mensagemModelo:
    "Preencha um cliente por linha a partir da linha 2, sem mudar o cabeçalho (nomes e ordem das colunas). " +
    "Obrigatórios: nome e cnpj_cpf (CNPJ com 14 dígitos ou CPF com 11, com ou sem máscara; dígitos verificadores " +
    "conferidos). Os demais podem ficar vazios e ser preenchidos depois. CNPJ/CPF já cadastrado: só os campos " +
    "preenchidos são atualizados. Apague a linha de exemplo antes de importar.",
  linhaExemplo: {
    nome: "Exemplo Comércio Ltda", cnpj_cpf: "11.222.333/0001-81", email: "compras@exemplo.com.br",
    celular: "(11) 98888-7777", whatsapp: "(11) 98888-7777", cidade: "São Paulo", uf: "SP", cep: "01001-000",
    segmento: "Varejo", anotacoes: "Linha de exemplo: apague antes de importar",
  },
};
