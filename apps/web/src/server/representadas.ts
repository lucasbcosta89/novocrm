import { idSchema, representadaSchema, representadaUpdateSchema, slugify } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";
import { verificarLimite } from "./quota";

export type Representada = {
  id: string;
  nome: string;
  cnpj: string | null;
  comissao_padrao: number;
  slug: string;
  status: string;
  criado_em: string;
};

const CAMPOS = "id, nome, cnpj, comissao_padrao, slug, status, criado_em";

export async function listarRepresentadas({ supabase }: Contexto): Promise<Representada[]> {
  const { data, error } = await supabase.from("representadas").select(CAMPOS).order("nome");
  if (error) throw erroBanco(error);
  return data;
}

export async function obterRepresentada({ supabase }: Contexto, id: string): Promise<Representada> {
  const { data, error } = await supabase.from("representadas").select(CAMPOS).eq("id", idSchema.parse(id)).single();
  if (error) throw erroBanco(error);
  return data;
}

export async function criarRepresentada(ctx: Contexto, input: unknown): Promise<Representada> {
  const dados = representadaSchema.parse(input);
  await verificarLimite(ctx, "representadas");

  // Slug é global (URL pública do catálogo); em colisão tenta com sufixo aleatório.
  const base = slugify(dados.nome);
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const slug = tentativa === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 4)}`;
    const { data, error } = await ctx.supabase
      .from("representadas")
      .insert({ ...dados, slug, user_id: ctx.userId })
      .select(CAMPOS)
      .single();
    if (!error) return data;
    if (error.code !== "23505" || !error.message.includes("slug")) throw erroBanco(error);
  }
  throw new AppError(409, "Não foi possível gerar um slug único", "slug");
}

export async function atualizarRepresentada({ supabase }: Contexto, id: string, input: unknown): Promise<Representada> {
  const dados = representadaUpdateSchema.parse(input);
  const { data, error } = await supabase
    .from("representadas")
    .update(dados)
    .eq("id", idSchema.parse(id))
    .select(CAMPOS)
    .single();
  if (error) throw erroBanco(error);
  return data;
}

export async function excluirRepresentada({ supabase }: Contexto, id: string): Promise<void> {
  const { error, count } = await supabase
    .from("representadas")
    .delete({ count: "exact" })
    .eq("id", idSchema.parse(id));
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Não encontrado", "nao_encontrado");
}
