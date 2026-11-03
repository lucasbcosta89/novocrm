import { z } from "zod";
import { filtroRepresentadasSchema, ORDENACOES, POR_PAGINA, termoBusca, type FiltroRepresentadas } from "@/lib/cadastros/listagem-representadas";
import type { RegistroRepresentada, Representada as RepresentadaContrato } from "@/lib/cadastros/tipos";
import { padraoBusca } from "./consultas";
import { campoDoErroRepresentada, representadaFormSchema, representadaParcialSchema } from "@/lib/cadastros/representada";
import { idSchema, slugify } from "@/lib/validacao";
import type { PostgrestError } from "@supabase/supabase-js";
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

export async function obterRepresentada({ supabase }: Contexto, id: string): Promise<Representada> {
  const { data, error } = await supabase.from("representadas").select(CAMPOS).eq("id", idSchema.parse(id)).single<Representada>();
  if (error) throw erroBanco(error);
  return data;
}

/** Erro do banco ligado a um campo (CNPJ/IE/código duplicado, obrigatório) vira AppError com code "campo:<nome>". */
function erroRepresentada(error: PostgrestError): AppError {
  const campo = campoDoErroRepresentada(`${error.message} ${error.details ?? ""}`);
  if (campo) return new AppError(error.code === "23505" ? 409 : 400, campo.mensagem, `campo:${campo.campo}`);
  return erroBanco(error);
}

/** Cria pela regra do cadastro (lib/cadastros/representada); código vazio = gerado no banco (REP-0001…). */
export async function criarRepresentada(ctx: Contexto, input: unknown): Promise<Representada> {
  const dados = representadaFormSchema.parse(input);
  await verificarLimite(ctx, "representadas");

  // Slug é global (URL pública do catálogo); em colisão tenta com sufixo aleatório.
  const base = slugify(dados.nome_fantasia ?? dados.razao_social);
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const slug = tentativa === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 4)}`;
    const { data, error } = await ctx.supabase
      .from("representadas")
      .insert({ ...dados, slug, user_id: ctx.userId })
      .select(CAMPOS)
      .single<Representada>();
    if (!error) return data;
    if (error.code !== "23505" || !error.message.includes("slug")) throw erroRepresentada(error);
  }
  throw new AppError(409, "Não foi possível gerar um slug único", "slug");
}

/** Edição: o formulário envia o registro inteiro; a API (PATCH) pode enviar só alguns campos. */
export async function atualizarRepresentada({ supabase }: Contexto, id: string, input: unknown, { parcial = false } = {}): Promise<Representada> {
  const dados = parcial ? representadaParcialSchema.parse(input) : representadaFormSchema.parse(input);
  const { data, error } = await supabase
    .from("representadas")
    .update(dados)
    .eq("id", idSchema.parse(id))
    .is("excluido_em", null)
    .select(CAMPOS)
    .single<Representada>();
  if (error) throw erroRepresentada(error);
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

/* ---------- Listagem (cadastro de representadas, Fase 2) ---------- */

export type LinhaListagemRepresentada = Pick<
  RepresentadaContrato,
  "id" | "codigo_representada" | "razao_social" | "nome_fantasia" | "cidade" | "uf" | "comissao_percentual" | "status" | "clientes_vinculados" | "valor_vendido_90d"
> & { cnpj: string | null; cidade: string | null; uf: string | null };

const CAMPOS_LISTAGEM =
  "id, codigo_representada, razao_social, nome_fantasia, cnpj, cidade, uf, comissao_percentual, status, clientes_vinculados, valor_vendido_90d";

/**
 * Listagem filtrada/ordenada/paginada pela view representadas_listagem (security_invoker: RLS do usuário).
 * Busca na coluna `busca` (razão social + fantasia + CNPJ sem máscara) com o termo normalizado do mesmo jeito.
 * paginar = false: visão filtrada completa (exportação CSV), limitada a 5.000 linhas.
 */
export async function listarRepresentadasListagem(
  { supabase }: Contexto,
  entrada: unknown,
  { paginar = true }: { paginar?: boolean } = {},
): Promise<{ linhas: LinhaListagemRepresentada[]; total: number; filtro: FiltroRepresentadas }> {
  const f = filtroRepresentadasSchema.parse(entrada);
  let q = supabase.from("representadas_listagem").select(CAMPOS_LISTAGEM, { count: "exact" });
  const padrao = padraoBusca(termoBusca(f.q));
  if (padrao) q = q.ilike("busca", padrao);
  if (f.status) q = q.eq("status", f.status);
  if (f.uf) q = q.eq("uf", f.uf);
  for (const col of ORDENACOES[f.ordem]) q = q.order(col, { ascending: f.dir === "asc", nullsFirst: false });
  q = q.order("id");
  q = paginar ? q.range((f.pagina - 1) * POR_PAGINA, f.pagina * POR_PAGINA - 1) : q.limit(5000);
  const { data, error, count } = await q.returns<LinhaListagemRepresentada[]>();
  if (error) throw erroBanco(error);
  return { linhas: data.map((l) => ({ ...l, comissao_percentual: Number(l.comissao_percentual), valor_vendido_90d: Number(l.valor_vendido_90d) })), total: count ?? 0, filtro: f };
}

/** Inativar/reativar (ação da linha). Inativa some do seletor de novo pedido; histórico e vínculos ficam. */
export async function alterarStatusRepresentada({ supabase }: Contexto, id: string, status: unknown): Promise<void> {
  const novo = z.enum(["ativa", "inativa"], "Status inválido").parse(status);
  const { error, count } = await supabase
    .from("representadas")
    .update({ status: novo }, { count: "exact" })
    .eq("id", idSchema.parse(id))
    .is("excluido_em", null);
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Representada não encontrada", "nao_encontrado");
}
