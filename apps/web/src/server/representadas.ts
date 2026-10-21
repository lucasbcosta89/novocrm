import { idSchema, representadaSchema, representadaUpdateSchema, slugify } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";
import { verificarLimite } from "./quota";

export type Representada = {
  id: string;
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
  slug: string;
  catalogo_publico: boolean;
  criar_pedido_publico: boolean;
  status: string;
  criado_em: string;
};

const CAMPOS =
  "id, nome, cnpj, rua, numero, complemento, cep, municipio, estado, email, telefone, slug, catalogo_publico, criar_pedido_publico, status, criado_em";

export async function listarRepresentadas({ supabase }: Contexto): Promise<Representada[]> {
  const { data, error } = await supabase.from("representadas").select(CAMPOS).order("nome");
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
