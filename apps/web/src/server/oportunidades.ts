import {
  acaoSchema, acaoUpdateSchema, idSchema, novaOportunidadeSchema, oportunidadeSchema, oportunidadeUpdateSchema, resultadoSchema,
} from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";
import { verificarLimite } from "./quota";

export type Acao = {
  id: string;
  oportunidade_id: string;
  descricao: string;
  responsavel: string | null;
  prazo: string | null;
  data_entrega: string | null;
  observacoes: string | null;
  status: string;
  criado_em: string;
};

export type Oportunidade = {
  id: string;
  cliente_id: string | null;
  representada_id: string | null;
  tipo: "oportunidade" | "desafio";
  titulo: string;
  descricao: string | null;
  valor_estimado: number | null;
  prioridade: string;
  status: string;
  cidade: string | null;
  estado: string | null;
  resultado: "ganhou" | "perdeu" | null;
  observacoes_resultado: string | null;
  data_conclusao: string | null;
  criado_em: string;
  atualizado_em: string;
  representada: { nome: string } | null;
  cliente: { id: string; nome: string } | null;
  acoes: { status: string }[];
};

export type OportunidadeDetalhe = Omit<Oportunidade, "acoes"> & { acoes: Acao[] };

const CAMPOS =
  "id, cliente_id, representada_id, tipo, titulo, descricao, valor_estimado, prioridade, status, cidade, estado, resultado, observacoes_resultado, data_conclusao, criado_em, atualizado_em, representada:representadas(nome), cliente:clientes(id, nome)";
const CAMPOS_ACAO = "id, oportunidade_id, descricao, responsavel, prazo, data_entrega, observacoes, status, criado_em";

function erroReferencia(error: Parameters<typeof erroBanco>[0]) {
  return error.code === "42501" ? new AppError(400, "Cliente ou representada inválidos", "referencia_invalida") : erroBanco(error);
}

export async function listarOportunidades({ supabase }: Contexto, clienteId: string): Promise<Oportunidade[]> {
  const { data, error } = await supabase
    .from("oportunidades_desafios")
    .select(`${CAMPOS}, acoes:plano_acao(status)`)
    .eq("cliente_id", idSchema.parse(clienteId))
    .order("criado_em", { ascending: false })
    .returns<Oportunidade[]>();
  if (error) throw erroBanco(error);
  return data;
}

export async function obterOportunidade({ supabase }: Contexto, id: string): Promise<OportunidadeDetalhe> {
  const { data, error } = await supabase
    .from("oportunidades_desafios")
    .select(`${CAMPOS}, acoes:plano_acao(${CAMPOS_ACAO})`)
    .eq("id", idSchema.parse(id))
    .order("criado_em", { referencedTable: "plano_acao", ascending: true })
    .single<OportunidadeDetalhe>();
  if (error) throw erroBanco(error);
  return data;
}

export async function criarOportunidade(ctx: Contexto, clienteId: string, input: unknown): Promise<Oportunidade> {
  const dados = oportunidadeSchema.parse(input);
  await verificarLimite(ctx, "oportunidades");
  const { supabase } = ctx;
  const { data, error } = await supabase
    .from("oportunidades_desafios")
    .insert({ ...dados, cliente_id: idSchema.parse(clienteId) })
    .select(`${CAMPOS}, acoes:plano_acao(status)`)
    .single<Oportunidade>();
  if (error) throw erroReferencia(error);
  return data;
}

export async function atualizarOportunidade(ctx: Contexto, id: string, input: unknown): Promise<OportunidadeDetalhe> {
  const dados = oportunidadeUpdateSchema.parse(input);
  const { error, count } = await ctx.supabase
    .from("oportunidades_desafios")
    .update(
      {
        ...dados,
        // saiu de "concluido": limpa o resultado (ele é gravado só pela conclusão)
        ...(dados.status && dados.status !== "concluido" ? { resultado: null, observacoes_resultado: null, data_conclusao: null } : {}),
        atualizado_em: new Date().toISOString(),
      },
      { count: "exact" },
    )
    .eq("id", idSchema.parse(id));
  if (error) throw erroReferencia(error);
  if (!count) throw new AppError(404, "Não encontrado", "nao_encontrado");
  return obterOportunidade(ctx, id);
}

export async function excluirOportunidade({ supabase }: Contexto, id: string): Promise<void> {
  const { error, count } = await supabase
    .from("oportunidades_desafios")
    .delete({ count: "exact" })
    .eq("id", idSchema.parse(id));
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Não encontrado", "nao_encontrado");
}

/* Plano de ação */

export async function criarAcao({ supabase }: Contexto, oportunidadeId: string, input: unknown): Promise<Acao> {
  const dados = acaoSchema.parse(input);
  const { data, error } = await supabase
    .from("plano_acao")
    .insert({ ...dados, oportunidade_id: idSchema.parse(oportunidadeId) })
    .select(CAMPOS_ACAO)
    .single<Acao>();
  if (error) throw error.code === "42501" ? new AppError(404, "Oportunidade não encontrada", "nao_encontrado") : erroBanco(error);
  return data;
}

export async function atualizarAcao({ supabase }: Contexto, id: string, input: unknown): Promise<Acao> {
  const dados = acaoUpdateSchema.parse(input);
  const { data, error } = await supabase
    .from("plano_acao")
    .update(dados)
    .eq("id", idSchema.parse(id))
    .select(CAMPOS_ACAO)
    .single<Acao>();
  if (error) throw erroBanco(error);
  return data;
}

export async function excluirAcao({ supabase }: Contexto, id: string): Promise<void> {
  const { error, count } = await supabase.from("plano_acao").delete({ count: "exact" }).eq("id", idSchema.parse(id));
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Não encontrado", "nao_encontrado");
}

/* ---------- Página global (kanban) ---------- */

export type CartaoKanban = Omit<Oportunidade, "acoes"> & {
  acoes: { status: string }[];
  produtos: { quantidade: number; produto: { sku: string; nome: string } | null }[];
};

/** Todas as oportunidades/desafios do usuário (com representada, cliente, ações e produtos). */
export async function listarKanban({ supabase }: Contexto): Promise<CartaoKanban[]> {
  const { data, error } = await supabase
    .from("oportunidades_desafios")
    .select(`${CAMPOS}, acoes:plano_acao(status), produtos:oportunidade_produtos(quantidade, produto:produtos(sku, nome))`)
    .order("atualizado_em", { ascending: false })
    .limit(1000)
    .returns<CartaoKanban[]>();
  if (error) throw erroBanco(error);
  return data;
}

/** Cria oportunidade (sem cliente) + produtos da representada + ações do plano; desfaz tudo se algo falhar. */
export async function criarOportunidadeGlobal(ctx: Contexto, input: unknown): Promise<CartaoKanban> {
  const { produtos, acoes, ...dados } = novaOportunidadeSchema.parse(input);
  await verificarLimite(ctx, "oportunidades");
  const { supabase } = ctx;
  const { data: op, error } = await supabase
    .from("oportunidades_desafios")
    .insert({ ...dados, user_id: ctx.userId })
    .select("id")
    .single<{ id: string }>();
  if (error) throw erroReferencia(error);

  try {
    if (produtos.length) {
      const { error: e } = await supabase
        .from("oportunidade_produtos")
        .insert(produtos.map((p) => ({ ...p, oportunidade_id: op.id })));
      if (e) throw e.code === "42501" ? new AppError(400, "Produto não pertence à representada", "referencia_invalida") : erroBanco(e);
    }
    if (acoes.length) {
      const { error: e } = await supabase.from("plano_acao").insert(acoes.map((a) => ({ ...a, oportunidade_id: op.id })));
      if (e) throw erroBanco(e);
    }
  } catch (e) {
    await supabase.from("oportunidades_desafios").delete().eq("id", op.id);
    throw e;
  }

  const { data, error: e2 } = await supabase
    .from("oportunidades_desafios")
    .select(`${CAMPOS}, acoes:plano_acao(status), produtos:oportunidade_produtos(quantidade, produto:produtos(sku, nome))`)
    .eq("id", op.id)
    .single<CartaoKanban>();
  if (e2) throw erroBanco(e2);
  return data;
}

/** Conclusão com resultado (Ganhou/Perdeu): grava status concluido, resultado, observações e data_conclusao. */
export async function concluirOportunidade(ctx: Contexto, id: string, input: unknown): Promise<OportunidadeDetalhe> {
  const r = resultadoSchema.parse(input);
  const { error, count } = await ctx.supabase
    .from("oportunidades_desafios")
    .update(
      {
        status: "concluido",
        resultado: r.resultado,
        observacoes_resultado: r.observacoes_resultado ?? null,
        data_conclusao: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      },
      { count: "exact" },
    )
    .eq("id", idSchema.parse(id));
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Não encontrado", "nao_encontrado");
  return obterOportunidade(ctx, id);
}
