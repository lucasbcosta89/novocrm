import type { RegistroRepresentada } from "@/lib/cadastros/tipos";
import { colunasRepresentada, idSchema, representadaSchema, representadaUpdateSchema, slugify } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";
import { verificarLimite } from "./quota";

/**
 * Registro da tabela (contrato em lib/cadastros/tipos) + campos do catálogo digital.
 * `nome` = alias de razao_social, mantido para as telas que só exibem o nome da representada.
 * Cadastros antigos podem ter cnpj/email/cidade/uf nulos até serem completados na edição.
 */
export type Representada = Omit<RegistroRepresentada, "cnpj" | "email_comercial" | "cidade" | "uf"> & {
  cnpj: string | null;
  email_comercial: string | null;
  cidade: string | null;
  uf: string | null;
  nome: string;
  slug: string;
  catalogo_publico: boolean;
  criar_pedido_publico: boolean;
};

const CAMPOS =
  "id, codigo_representada, razao_social, nome:razao_social, nome_fantasia, cnpj, inscricao_estadual, email_comercial, telefone, " +
  "contato_nome, contato_telefone, cep, endereco, numero, complemento, bairro, cidade, uf, comissao_percentual, prazo_pagamento_dias, " +
  "tabela_preco, status, observacoes, criado_em, atualizado_em, excluido_em, slug, catalogo_publico, criar_pedido_publico";

/** Representadas não excluídas (exclusão lógica). As inativas vêm junto; seletores de novo pedido filtram. */
export async function listarRepresentadas({ supabase }: Contexto): Promise<Representada[]> {
  const { data, error } = await supabase.from("representadas").select(CAMPOS).is("excluido_em", null).order("razao_social").returns<Representada[]>();
  if (error) throw erroBanco(error);
  return data;
}

/** Lista com nº de SKUs ativos por representada (página inicial de Representadas). */
export async function listarRepresentadasComSkus(ctx: Contexto): Promise<(Representada & { skus: number })[]> {
  const [reps, produtos] = await Promise.all([
    listarRepresentadas(ctx),
    ctx.supabase.from("produtos").select("representada_id").eq("ativo", true).returns<{ representada_id: string }[]>(),
  ]);
  if (produtos.error) throw erroBanco(produtos.error);
  const porRep = new Map<string, number>();
  for (const p of produtos.data) porRep.set(p.representada_id, (porRep.get(p.representada_id) ?? 0) + 1);
  return reps.map((r) => ({ ...r, skus: porRep.get(r.id) ?? 0 }));
}

export async function obterRepresentada({ supabase }: Contexto, id: string): Promise<Representada> {
  const { data, error } = await supabase.from("representadas").select(CAMPOS).eq("id", idSchema.parse(id)).single<Representada>();
  if (error) throw erroBanco(error);
  return data;
}

export async function criarRepresentada(ctx: Contexto, input: unknown): Promise<Representada> {
  const entrada = representadaSchema.parse(input);
  const dados = colunasRepresentada(entrada);
  await verificarLimite(ctx, "representadas");

  // Slug é global (URL pública do catálogo); em colisão tenta com sufixo aleatório.
  const base = slugify(entrada.nome);
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const slug = tentativa === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 4)}`;
    const { data, error } = await ctx.supabase
      .from("representadas")
      .insert({ ...dados, slug, user_id: ctx.userId })
      .select(CAMPOS)
      .single<Representada>();
    if (!error) return data;
    if (error.code !== "23505" || !error.message.includes("slug")) throw erroBanco(error);
  }
  throw new AppError(409, "Não foi possível gerar um slug único", "slug");
}

export async function atualizarRepresentada({ supabase }: Contexto, id: string, input: unknown): Promise<Representada> {
  const dados = colunasRepresentada(representadaUpdateSchema.parse(input));
  const { data, error } = await supabase
    .from("representadas")
    .update(dados)
    .eq("id", idSchema.parse(id))
    .select(CAMPOS)
    .single<Representada>();
  if (error) throw erroBanco(error);
  return data;
}

/**
 * Exclusão SEMPRE lógica (excluido_em + inativa): pedidos, comissões e vínculos históricos continuam
 * apontando para o registro. A vaga do plano é devolvida pelo trigger de quota.
 */
export async function excluirRepresentada({ supabase }: Contexto, id: string): Promise<void> {
  const { error, count } = await supabase
    .from("representadas")
    .update({ excluido_em: new Date().toISOString(), status: "inativa", catalogo_publico: false, criar_pedido_publico: false }, { count: "exact" })
    .eq("id", idSchema.parse(id))
    .is("excluido_em", null);
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Não encontrado", "nao_encontrado");
}
