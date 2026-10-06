import { idSchema, produtoSchema, produtoUpdateSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

export type Produto = {
  id: string;
  representada_id: string;
  sku: string;
  nome: string;
  descricao: string | null;
  unidade: string | null;
  preco: number;
  desconto_max: number;
  ativo: boolean;
};

type ProdutoRow = Omit<Produto, "desconto_max"> & {
  tabelas_preco: { preco: number; desconto_max: number | null }[];
};

// Preço padrão = linha de tabelas_preco com cliente_id null.
const CAMPOS =
  "id, representada_id, sku, nome, descricao, unidade, preco, ativo, tabelas_preco(preco, desconto_max)";
const DUPLICADO = "Já existe produto com este SKU nesta representada";

function mapear({ tabelas_preco, ...p }: ProdutoRow): Produto {
  const padrao = tabelas_preco[0];
  return { ...p, preco: padrao?.preco ?? p.preco, desconto_max: padrao?.desconto_max ?? 0 };
}

async function salvarPrecoPadrao(
  { supabase }: Contexto,
  p: { id: string; representada_id: string },
  preco: number,
  desconto_max: number,
) {
  const { error } = await supabase
    .from("tabelas_preco")
    .upsert(
      { representada_id: p.representada_id, produto_id: p.id, cliente_id: null, preco, desconto_max },
      { onConflict: "produto_id,cliente_id" },
    );
  if (error) throw erroBanco(error);
}

function consultaProdutos({ supabase }: Contexto) {
  return supabase.from("produtos").select(CAMPOS).is("tabelas_preco.cliente_id", null);
}

export async function listarProdutos(ctx: Contexto, representadaId: string): Promise<Produto[]> {
  const { data, error } = await consultaProdutos(ctx)
    .eq("representada_id", idSchema.parse(representadaId))
    .order("nome")
    .returns<ProdutoRow[]>();
  if (error) throw erroBanco(error);
  return data.map(mapear);
}

export async function obterProduto(ctx: Contexto, id: string): Promise<Produto> {
  const { data, error } = await consultaProdutos(ctx).eq("id", idSchema.parse(id)).single<ProdutoRow>();
  if (error) throw erroBanco(error);
  return mapear(data);
}

export async function criarProduto(ctx: Contexto, representadaId: string, input: unknown): Promise<Produto> {
  const { desconto_max, ...dados } = produtoSchema.parse(input);
  const { data, error } = await ctx.supabase
    .from("produtos")
    .insert({ ...dados, representada_id: idSchema.parse(representadaId) })
    .select("id, representada_id")
    .single<{ id: string; representada_id: string }>();
  if (error) {
    if (error.code === "42501") throw new AppError(404, "Representada não encontrada", "nao_encontrado");
    throw erroBanco(error, DUPLICADO);
  }
  await salvarPrecoPadrao(ctx, data, dados.preco, desconto_max);
  return obterProduto(ctx, data.id);
}

export async function atualizarProduto(ctx: Contexto, id: string, input: unknown): Promise<Produto> {
  const { desconto_max, ...dados } = produtoUpdateSchema.parse(input);
  const atual = await obterProduto(ctx, id);
  if (Object.keys(dados).length) {
    const { error } = await ctx.supabase.from("produtos").update(dados).eq("id", atual.id);
    if (error) throw erroBanco(error, DUPLICADO);
  }
  if (dados.preco !== undefined || desconto_max !== undefined) {
    await salvarPrecoPadrao(ctx, atual, dados.preco ?? atual.preco, desconto_max ?? atual.desconto_max);
  }
  return obterProduto(ctx, atual.id);
}

export async function excluirProduto({ supabase }: Contexto, id: string): Promise<void> {
  const { error, count } = await supabase.from("produtos").delete({ count: "exact" }).eq("id", idSchema.parse(id));
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Não encontrado", "nao_encontrado");
}
