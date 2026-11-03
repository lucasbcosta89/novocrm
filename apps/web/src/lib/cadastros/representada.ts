import { z } from "zod";
import {
  cnpjValido, emailValido, inscricaoEstadualValida, normalizarCep, normalizarCnpj, normalizarDecimal, normalizarEmail,
  normalizarInscricaoEstadual, normalizarTelefone, normalizarUf, telefoneValido, ufValida,
} from "./normalizadores";

/**
 * Regras dos campos da representada — as MESMAS no formulário (validação ao sair do campo), no servidor
 * e na importação por planilha. Cada campo recebe o texto digitado e devolve o valor normalizado do banco.
 */

const vazio = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");
const textoOpcional = (max: number, rotulo: string) =>
  z.preprocess((v) => (vazio(v) ? null : String(v).trim()), z.string().max(max, `${rotulo}: máximo de ${max} caracteres`).nullable());
/** Vazio vira undefined: o z.string("Informe …") do campo dá a mensagem de obrigatório. */
const obrigatorio = (v: unknown) => (vazio(v) ? undefined : v);

export const CAMPOS_REPRESENTADA = {
  codigo_representada: z.preprocess(
    (v) => (vazio(v) ? null : String(v).trim().toUpperCase()),
    z.string().max(20, "Código: máximo de 20 caracteres").nullable(),
  ),
  razao_social: z.preprocess(
    obrigatorio,
    z.string("Informe a razão social").trim().min(3, "Razão social deve ter de 3 a 150 caracteres").max(150, "Razão social deve ter de 3 a 150 caracteres"),
  ),
  nome_fantasia: textoOpcional(100, "Nome fantasia"),
  cnpj: z.preprocess(
    (v) => normalizarCnpj(v) ?? undefined,
    z.string("Informe o CNPJ").length(14, "CNPJ deve ter 14 dígitos").refine(cnpjValido, "CNPJ inválido (dígito verificador não confere)"),
  ),
  inscricao_estadual: z.preprocess(
    normalizarInscricaoEstadual,
    z.string().refine(inscricaoEstadualValida, "Inscrição estadual: só números (até 14) ou ISENTO").nullable(),
  ),
  email_comercial: z.preprocess(
    (v) => normalizarEmail(v) ?? undefined,
    z.string("Informe o e-mail comercial").refine(emailValido, "E-mail inválido"),
  ),
  telefone: z.preprocess(normalizarTelefone, z.string().refine(telefoneValido, "Telefone: DDD + número (10 ou 11 dígitos)").nullable()),
  contato_nome: textoOpcional(100, "Nome do contato"),
  contato_telefone: z.preprocess(normalizarTelefone, z.string().refine(telefoneValido, "Telefone do contato: DDD + número (10 ou 11 dígitos)").nullable()),
  cep: z.preprocess(normalizarCep, z.string().length(8, "CEP deve ter 8 dígitos").nullable()),
  endereco: textoOpcional(150, "Endereço"),
  numero: textoOpcional(20, "Número"),
  complemento: textoOpcional(60, "Complemento"),
  bairro: textoOpcional(80, "Bairro"),
  cidade: z.preprocess(obrigatorio, z.string("Informe a cidade").trim().min(2, "Cidade deve ter de 2 a 80 caracteres").max(80, "Cidade deve ter de 2 a 80 caracteres")),
  uf: z.preprocess((v) => normalizarUf(v) ?? undefined, z.string("Informe a UF").refine(ufValida, "UF inválida")),
  comissao_percentual: z.preprocess(
    (v) => normalizarDecimal(v) ?? undefined,
    z.number("Informe a comissão (0 a 100)")
      .min(0, "Comissão deve estar entre 0 e 100")
      .max(100, "Comissão deve estar entre 0 e 100")
      .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "Comissão: no máximo 2 casas decimais"),
  ),
  prazo_pagamento_dias: z.preprocess(
    (v) => (vazio(v) ? null : normalizarDecimal(v)),
    z.number("Prazo deve ser um número de dias").int("Prazo deve ser em dias inteiros").min(0, "Prazo entre 0 e 365 dias").max(365, "Prazo entre 0 e 365 dias").nullable(),
  ),
  tabela_preco: textoOpcional(60, "Tabela de preço"),
  status: z.preprocess((v) => (vazio(v) ? "ativa" : String(v).trim().toLowerCase()), z.enum(["ativa", "inativa"], "Status deve ser Ativa ou Inativa")),
  observacoes: textoOpcional(500, "Observações"),
} as const;

export type CampoRepresentada = keyof typeof CAMPOS_REPRESENTADA;
export const CAMPOS_FORM_REPRESENTADA = Object.keys(CAMPOS_REPRESENTADA) as CampoRepresentada[];

/** Obrigatórios do cadastro (marcados com * no formulário). */
export const OBRIGATORIOS_REPRESENTADA: readonly CampoRepresentada[] = ["razao_social", "cnpj", "email_comercial", "cidade", "uf", "comissao_percentual"];

export const representadaFormSchema = z.object({
  ...CAMPOS_REPRESENTADA,
  catalogo_publico: z.boolean().optional(),
  criar_pedido_publico: z.boolean().optional(),
});
export type DadosRepresentada = z.infer<typeof representadaFormSchema>;

/** PATCH da API: só os campos enviados (sem os padrões). */
export const representadaParcialSchema = z.object(
  Object.fromEntries(Object.entries(representadaFormSchema.shape).map(([k, s]) => [k, (s as z.ZodType).optional()])),
) as unknown as z.ZodType<Partial<DadosRepresentada>>;

/** Validação de UM campo (ao sair do campo): mensagem do primeiro problema, ou null. */
export function validarCampoRepresentada(campo: CampoRepresentada, valor: unknown): string | null {
  const r = CAMPOS_REPRESENTADA[campo].safeParse(valor);
  return r.success ? null : (r.error.issues[0]?.message ?? "Valor inválido");
}

/** Todas as mensagens por campo (formulário inteiro). */
export function validarRepresentada(valores: Record<string, unknown>): Partial<Record<CampoRepresentada, string>> {
  const erros: Partial<Record<CampoRepresentada, string>> = {};
  for (const c of CAMPOS_FORM_REPRESENTADA) {
    const m = validarCampoRepresentada(c, valores[c]);
    if (m) erros[c] = m;
  }
  return erros;
}

/**
 * Erro do banco → campo do formulário (unicidade por usuário e obrigatórios do trigger).
 * Devolve null quando o erro não é de um campo específico.
 */
export function campoDoErroRepresentada(mensagem: string): { campo: CampoRepresentada; mensagem: string } | null {
  if (/representadas_user_cnpj_key/.test(mensagem)) return { campo: "cnpj", mensagem: "Já existe uma representada com este CNPJ" };
  if (/representadas_user_ie_key/.test(mensagem)) return { campo: "inscricao_estadual", mensagem: "Já existe uma representada com esta inscrição estadual" };
  if (/representadas_user_codigo_key/.test(mensagem)) return { campo: "codigo_representada", mensagem: "Este código já foi usado em outra representada" };
  const obrig: [RegExp, CampoRepresentada][] = [[/CNPJ/, "cnpj"], [/e-mail/, "email_comercial"], [/cidade/, "cidade"], [/UF/, "uf"]];
  if (/^Informe /.test(mensagem)) for (const [re, campo] of obrig) if (re.test(mensagem)) return { campo, mensagem };
  return null;
}

/* ---------- Formulário ---------- */

export type ValoresFormRepresentada = Record<CampoRepresentada, string>;

export const VALORES_VAZIOS_REPRESENTADA: ValoresFormRepresentada = {
  codigo_representada: "", razao_social: "", nome_fantasia: "", cnpj: "", inscricao_estadual: "", email_comercial: "",
  telefone: "", contato_nome: "", contato_telefone: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "",
  cidade: "", uf: "", comissao_percentual: "", prazo_pagamento_dias: "", tabela_preco: "", status: "ativa", observacoes: "",
};

/** Registro do banco → valores do formulário (comissão com vírgula decimal). */
export function valoresDaRepresentada(r: Partial<Record<CampoRepresentada, unknown>>): ValoresFormRepresentada {
  const v = { ...VALORES_VAZIOS_REPRESENTADA };
  for (const c of CAMPOS_FORM_REPRESENTADA) {
    const x = r[c];
    if (x == null) continue;
    v[c] = c === "comissao_percentual" ? String(Number(x)).replace(".", ",") : String(x);
  }
  return v;
}
