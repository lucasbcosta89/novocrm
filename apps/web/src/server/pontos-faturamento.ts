import { idSchema, pontoFaturamentoSchema, pontoFaturamentoUpdateSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

export type PontoFaturamento = {
  id: string;
  representada_id: string;
  nome: string;
  cnpj: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  cep: string | null;
  municipio: string | null;
  estado: string | null;
  email: string | null;
  telefone: string | null;
  status: string;
  criado_em: string;
};

const CAMPOS = "id, representada_id, nome, cnpj, rua, numero, complemento, cep, municipio, estado, email, telefone, status, criado_em";

export async function listarPontos({ supabase }: Contexto, representadaId: string): Promise<PontoFaturamento[]> {
  const { data, error } = await supabase
    .from("pontos_faturamento")
    .select(CAMPOS)
    .eq("representada_id", idSchema.parse(representadaId))
    .order("nome")
    .returns<PontoFaturamento[]>();
  if (error) throw erroBanco(error);
  return data;
}

export async function criarPonto({ supabase }: Contexto, representadaId: string, input: unknown): Promise<PontoFaturamento> {
  const dados = pontoFaturamentoSchema.parse(input);
  const { data, error } = await supabase
    .from("pontos_faturamento")
    .insert({ ...dados, representada_id: idSchema.parse(representadaId) })
    .select(CAMPOS)
    .single<PontoFaturamento>();
  if (error) throw error.code === "42501" ? new AppError(404, "Representada não encontrada", "nao_encontrado") : erroBanco(error);
  return data;
}

export async function atualizarPonto({ supabase }: Contexto, id: string, input: unknown): Promise<PontoFaturamento> {
  const dados = pontoFaturamentoUpdateSchema.parse(input);
  const { data, error } = await supabase
    .from("pontos_faturamento")
    .update(dados)
    .eq("id", idSchema.parse(id))
    .select(CAMPOS)
    .single<PontoFaturamento>();
  if (error) throw erroBanco(error);
  return data;
}

export async function excluirPonto({ supabase }: Contexto, id: string): Promise<void> {
  const { error, count } = await supabase.from("pontos_faturamento").delete({ count: "exact" }).eq("id", idSchema.parse(id));
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Não encontrado", "nao_encontrado");
}
