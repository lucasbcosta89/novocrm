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

export const TIPOS_PAGAMENTO_COMISSAO = ["faturamento", "pagamento", "outro"] as const;
export const REFERENCIAS_PAGAMENTO_COMISSAO = ["faturamento", "pagamento"] as const;
export type TipoPagamentoComissao = (typeof TIPOS_PAGAMENTO_COMISSAO)[number];
export type ReferenciaPagamentoComissao = (typeof REFERENCIAS_PAGAMENTO_COMISSAO)[number];
export const MSG_DIAS_COMISSAO = "Informe o número de dias entre 1 e 365.";
export const MSG_REFERENCIA_COMISSAO = "Selecione a referência.";

/** Rótulo de exibição (listagem e detalhe): "No faturamento", "No pagamento" ou "30 dias após o faturamento". */
export function rotuloPagamentoComissao(tipo: string | null | undefined, referencia?: string | null, dias?: number | null): string {
  if (tipo === "pagamento") return "No pagamento";
  if (tipo === "outro" && dias != null && referencia) return `${dias} ${dias === 1 ? "dia" : "dias"} após o ${referencia === "pagamento" ? "pagamento" : "faturamento"}`;
  return "No faturamento";
}

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
  /** Comissão fixa (se houver): vale para os produtos SEM comissão própria no catálogo; vazio = não há. */
  comissao_percentual: z.preprocess(
    normalizarDecimal,
    z.number("Comissão fixa deve ser um número de 0 a 100")
      .min(0, "Comissão fixa deve estar entre 0 e 100")
      .max(100, "Comissão fixa deve estar entre 0 e 100")
      .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "Comissão fixa: no máximo 2 casas decimais")
      .nullable(),
  ),
  prazo_pagamento_dias: z.preprocess(
    (v) => (vazio(v) ? null : normalizarDecimal(v)),
    z.number("Prazo deve ser um número de dias").int("Prazo deve ser em dias inteiros").min(0, "Prazo entre 0 e 365 dias").max(365, "Prazo entre 0 e 365 dias").nullable(),
  ),
  tabela_preco: textoOpcional(60, "Tabela de preço"),
  /** Pagamento da comissão (só cadastro): no faturamento, no pagamento ou "outro" (N dias após faturamento/pagamento). */
  comissao_pagamento_tipo: z.preprocess(
    (v) => (vazio(v) ? "faturamento" : String(v).trim().toLowerCase()),
    z.enum(TIPOS_PAGAMENTO_COMISSAO, "Pagamento da comissão inválido"),
  ),
  comissao_pagamento_referencia: z.preprocess(
    (v) => (vazio(v) ? null : String(v).trim().toLowerCase()),
    z.enum(REFERENCIAS_PAGAMENTO_COMISSAO, MSG_REFERENCIA_COMISSAO).nullable(),
  ),
  comissao_pagamento_dias: z.preprocess(
    (v) => (vazio(v) ? null : /^\s*\d+\s*$/.test(String(v)) ? Number(String(v).trim()) : typeof v === "number" ? v : NaN),
    z.number(MSG_DIAS_COMISSAO).int(MSG_DIAS_COMISSAO).min(1, MSG_DIAS_COMISSAO).max(365, MSG_DIAS_COMISSAO).nullable(),
  ),
  status: z.preprocess((v) => (vazio(v) ? "ativa" : String(v).trim().toLowerCase()), z.enum(["ativa", "inativa"], "Status deve ser Ativa ou Inativa")),
  observacoes: textoOpcional(500, "Observações"),
} as const;

export type CampoRepresentada = keyof typeof CAMPOS_REPRESENTADA;
export const CAMPOS_FORM_REPRESENTADA = Object.keys(CAMPOS_REPRESENTADA) as CampoRepresentada[];

/** Obrigatórios do cadastro (marcados com * no formulário). */
export const OBRIGATORIOS_REPRESENTADA: readonly CampoRepresentada[] = ["razao_social", "cnpj", "email_comercial", "cidade", "uf"];

const objetoRepresentada = z.object({
  ...CAMPOS_REPRESENTADA,
  catalogo_publico: z.boolean().optional(),
  criar_pedido_publico: z.boolean().optional(),
});

type Pagamento = { comissao_pagamento_tipo?: string; comissao_pagamento_referencia?: string | null; comissao_pagamento_dias?: number | null };
/** "Outro" exige referência e dias. */
function exigirPagamento(d: Pagamento, ctx: z.RefinementCtx) {
  if (d.comissao_pagamento_tipo !== "outro") return;
  if (!d.comissao_pagamento_referencia) ctx.addIssue({ code: "custom", message: MSG_REFERENCIA_COMISSAO, path: ["comissao_pagamento_referencia"] });
  if (d.comissao_pagamento_dias == null) ctx.addIssue({ code: "custom", message: MSG_DIAS_COMISSAO, path: ["comissao_pagamento_dias"] });
}
/** Fora de "outro", referência e dias são sempre null (nada de resíduo de uma escolha anterior). */
function limparPagamento<T extends Pagamento>(d: T): T {
  return d.comissao_pagamento_tipo !== undefined && d.comissao_pagamento_tipo !== "outro"
    ? { ...d, comissao_pagamento_referencia: null, comissao_pagamento_dias: null }
    : d;
}

/** Antes de validar: fora de "outro", referência e dias enviados são descartados (não bloqueiam o salvamento). */
function descartarResiduo(v: unknown) {
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  if (o.comissao_pagamento_tipo === undefined) return v;
  return String(o.comissao_pagamento_tipo ?? "").trim().toLowerCase() === "outro"
    ? v
    : { ...o, comissao_pagamento_referencia: null, comissao_pagamento_dias: null };
}

export const representadaFormSchema = z.preprocess(descartarResiduo, objetoRepresentada.superRefine(exigirPagamento).transform(limparPagamento));
export type DadosRepresentada = z.infer<typeof representadaFormSchema>;

/** PATCH da API: só os campos enviados (sem os padrões). Mudar o tipo para "outro" exige mandar referência e dias. */
export const representadaParcialSchema = z.preprocess(descartarResiduo, z
  .object(Object.fromEntries(Object.entries(objetoRepresentada.shape).map(([k, s]) => [k, (s as z.ZodType).optional()])))
  .superRefine((d, ctx) => exigirPagamento(d as Pagamento, ctx))
  .transform((d) => limparPagamento(d as Pagamento))) as unknown as z.ZodType<Partial<DadosRepresentada>>;

/** Validação de UM campo (ao sair do campo): mensagem do primeiro problema, ou null. */
export function validarCampoRepresentada(campo: CampoRepresentada, valor: unknown): string | null {
  const r = CAMPOS_REPRESENTADA[campo].safeParse(valor);
  return r.success ? null : (r.error.issues[0]?.message ?? "Valor inválido");
}

/** Todas as mensagens por campo (formulário inteiro), inclusive a regra entre os campos do pagamento da comissão. */
export function validarRepresentada(valores: Record<string, unknown>): Partial<Record<CampoRepresentada, string>> {
  const erros: Partial<Record<CampoRepresentada, string>> = {};
  const outro = String(valores.comissao_pagamento_tipo ?? "").trim().toLowerCase() === "outro";
  for (const c of CAMPOS_FORM_REPRESENTADA) {
    // referência e dias só contam quando o tipo é "outro" (fora dele são descartados)
    if (!outro && (c === "comissao_pagamento_referencia" || c === "comissao_pagamento_dias")) continue;
    const m = validarCampoRepresentada(c, valores[c]);
    if (m) erros[c] = m;
  }
  if (outro) {
    if (!erros.comissao_pagamento_referencia && vazio(valores.comissao_pagamento_referencia)) erros.comissao_pagamento_referencia = MSG_REFERENCIA_COMISSAO;
    if (!erros.comissao_pagamento_dias && vazio(valores.comissao_pagamento_dias)) erros.comissao_pagamento_dias = MSG_DIAS_COMISSAO;
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
  cidade: "", uf: "", comissao_percentual: "", prazo_pagamento_dias: "", tabela_preco: "",
  comissao_pagamento_tipo: "faturamento", comissao_pagamento_referencia: "", comissao_pagamento_dias: "", status: "ativa", observacoes: "",
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
