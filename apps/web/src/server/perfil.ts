import "server-only";
import { z } from "zod";
import { VERSAO_CONSENTIMENTO_LGPD } from "@/conteudo/consentimento-lgpd";
import { VERSAO_POLITICA } from "@/conteudo/politica-privacidade.gerado";
import { cnpjValido, cpfValido, ocultarCnpj, ocultarCpf } from "@/lib/documentos-br";
import { SIGLAS_UF } from "@/lib/ufs";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

function chave(): string {
  const k = process.env.DADOS_PESSOAIS_CHAVE;
  if (!k || k.length < 32) throw new AppError(500, "Configuração ausente: DADOS_PESSOAIS_CHAVE", "config");
  return k;
}

export type Perfil = {
  email: string;
  nome: string;
  nome_empresa: string | null;
  rua: string | null;
  numero: string | null;
  municipio: string | null;
  estado: string | null;
  consentimento_lgpd_aceito_em: string | null;
  consentimento_lgpd_versao: string | null;
  politica_privacidade_aceita_em: string | null;
  politica_privacidade_versao: string | null;
  /** Sempre mascarados (000.000.000-**); o valor completo só via revelarDocumentos. */
  cpf_oculto: string | null;
  cnpj_oculto: string | null;
};

const CAMPOS =
  "email, nome, nome_empresa, rua, numero, municipio, estado, consentimento_lgpd_aceito_em, consentimento_lgpd_versao, politica_privacidade_aceita_em, politica_privacidade_versao";

/** CPF/CNPJ completos do próprio usuário (decifrados no banco com a chave do servidor). */
export async function revelarDocumentos({ supabase }: Contexto): Promise<{ cpf: string | null; cnpj: string | null }> {
  const { data, error } = await supabase.rpc("obter_documentos_usuario", { p_chave: chave() });
  if (error) throw erroBanco(error);
  const linha = (data as { cpf: string | null; cnpj: string | null }[])[0];
  return { cpf: linha?.cpf ?? null, cnpj: linha?.cnpj ?? null };
}

export async function obterPerfil(ctx: Contexto): Promise<Perfil> {
  const [{ data, error }, docs] = await Promise.all([
    ctx.supabase.from("usuarios").select(CAMPOS).eq("id", ctx.userId).single<Omit<Perfil, "cpf_oculto" | "cnpj_oculto">>(),
    revelarDocumentos(ctx),
  ]);
  if (error) throw erroBanco(error);
  return { ...data, cpf_oculto: ocultarCpf(docs.cpf), cnpj_oculto: ocultarCnpj(docs.cnpj) };
}

/** Cadastro completo = CPF + endereço + aceites LGPD e política. */
export const cadastroCompleto = (p: Perfil) =>
  Boolean(p.cpf_oculto && p.rua && p.numero && p.municipio && p.estado && p.consentimento_lgpd_aceito_em && p.politica_privacidade_aceita_em);

const texto = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max);

export const perfilSchema = z.object({
  nome: texto(2, 160, "Informe o nome"),
  cpf: z.string().refine(cpfValido, "CPF inválido"),
  nome_empresa: z.string().trim().max(160).optional().default(""),
  cnpj: z
    .string()
    .optional()
    .default("")
    .refine((v) => v.replace(/\D/g, "") === "" || cnpjValido(v), "CNPJ inválido"),
  rua: texto(2, 160, "Informe a rua"),
  numero: texto(1, 20, "Informe o número (ou S/N)"),
  municipio: texto(2, 80, "Informe o município"),
  estado: z.string().refine((uf) => SIGLAS_UF.includes(uf), "Selecione o estado"),
});

export const aceitesSchema = z.object({
  aceite_lgpd: z.literal("on", "Aceite o consentimento LGPD"),
  aceite_politica: z.literal("on", "Aceite a Política de Privacidade"),
});

/**
 * Salva os dados. O banco revalida os DVs, cifra CPF/CNPJ e grava data/hora + versão dos aceites
 * (aceites só no cadastro inicial; na edição permanecem os já registrados).
 */
export async function salvarPerfil(ctx: Contexto, input: unknown, comAceites: boolean): Promise<void> {
  const dados = perfilSchema.parse(input);
  if (comAceites) aceitesSchema.parse(input);
  const { error } = await ctx.supabase.rpc("salvar_dados_usuario", {
    p_dados: dados,
    p_chave: chave(),
    p_versao_lgpd: comAceites ? VERSAO_CONSENTIMENTO_LGPD : null,
    p_versao_politica: comAceites ? VERSAO_POLITICA : null,
  });
  if (error) throw erroBanco(error);
}
