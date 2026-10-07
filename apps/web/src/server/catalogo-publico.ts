import "server-only";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizarTelefone } from "@/lib/whatsapp";
import { AppError } from "./erros";

/** Leitura pública (sem sessão): só representadas com catalogo_publico = true. Usa service role com filtros explícitos. */

export type MarcaPublica = { id: string; nome: string; slug: string };
export type ProdutoPublico = {
  id: string;
  sku: string;
  nome: string;
  descricao: string | null;
  unidade: string | null;
  categoria: string | null;
  preco: number;
  temImagem: boolean;
};
export type CatalogoPublico = {
  marca: MarcaPublica & { aceitaPedidos: boolean };
  marcas: MarcaPublica[]; // outras marcas públicas do mesmo representante (abas)
  representante: { nome: string; whatsapp: string | null };
  produtos: ProdutoPublico[];
};

export async function carregarCatalogoPublico(slug: string): Promise<CatalogoPublico | null> {
  const admin = supabaseAdmin();
  const { data: rep } = await admin
    .from("representadas")
    .select("id, nome, slug, user_id, criar_pedido_publico")
    .eq("slug", slug)
    .eq("catalogo_publico", true)
    .maybeSingle<{ id: string; nome: string; slug: string; user_id: string; criar_pedido_publico: boolean }>();
  if (!rep) return null;

  const [marcas, usuario, produtos] = await Promise.all([
    admin.from("representadas").select("id, nome, slug").eq("user_id", rep.user_id).eq("catalogo_publico", true).order("nome")
      .returns<MarcaPublica[]>(),
    admin.from("usuarios").select("nome, whatsapp").eq("id", rep.user_id).single<{ nome: string; whatsapp: string | null }>(),
    admin.from("produtos")
      .select("id, sku, nome, descricao, unidade, categoria, preco, imagem_url, tabelas_preco(preco)")
      .eq("representada_id", rep.id).eq("ativo", true).is("tabelas_preco.cliente_id", null).order("nome")
      .returns<(Omit<ProdutoPublico, "temImagem"> & { imagem_url: string | null; tabelas_preco: { preco: number }[] })[]>(),
  ]);

  return {
    marca: { id: rep.id, nome: rep.nome, slug: rep.slug, aceitaPedidos: rep.criar_pedido_publico },
    marcas: marcas.data ?? [],
    representante: { nome: usuario.data?.nome ?? "", whatsapp: normalizarTelefone(usuario.data?.whatsapp) },
    produtos: (produtos.data ?? []).map(({ imagem_url, tabelas_preco, ...p }) => ({
      ...p,
      preco: Number(tabelas_preco[0]?.preco ?? p.preco),
      temImagem: Boolean(imagem_url),
    })),
  };
}

/** Chave da imagem de um produto de catálogo público (para a rota de imagem). */
export async function imagemProdutoPublico(slug: string, produtoId: string): Promise<string | null> {
  if (!z.uuid().safeParse(produtoId).success) return null;
  const { data } = await supabaseAdmin()
    .from("produtos")
    .select("imagem_url, representada:representadas!inner(slug, catalogo_publico)")
    .eq("id", produtoId)
    .eq("ativo", true)
    .eq("representada.slug", slug)
    .eq("representada.catalogo_publico", true)
    .maybeSingle<{ imagem_url: string | null }>();
  return data?.imagem_url ?? null;
}

export const pedidoPublicoSchema = z.object({
  slug: z.string().min(1).max(80),
  cliente: z.object({
    nome: z.string().trim().min(2, "Informe seu nome").max(160),
    whatsapp: z.string().refine((v) => normalizarTelefone(v) != null, "Informe um WhatsApp válido com DDD"),
    documento: z.string().trim().max(20).optional(),
    email: z.union([z.email("E-mail inválido"), z.literal("")]).optional(),
    cidade: z.string().trim().max(80).optional(),
    uf: z.string().trim().max(2).optional(),
  }),
  itens: z.array(z.object({ produto_id: z.uuid(), quantidade: z.number().positive().max(100000) })).min(1, "Carrinho vazio").max(200),
  observacoes: z.string().trim().max(1000).optional(),
  site: z.string().max(0, "inválido").optional(), // honeypot anti-robô
});

export type ResultadoPedidoPublico = { pedido_id: string; numero: string; user_id: string; cliente_id: string; valor_total: number };

/** Cria o pedido (origem catalogo_web, rascunho) pela função SQL criar_pedido_publico. */
export async function criarPedidoPublico(input: unknown): Promise<ResultadoPedidoPublico> {
  const p = pedidoPublicoSchema.parse(input);
  const { data, error } = await supabaseAdmin().rpc("criar_pedido_publico", {
    p_slug: p.slug,
    p_cliente: { ...p.cliente, whatsapp: normalizarTelefone(p.cliente.whatsapp)!.slice(2) },
    p_itens: p.itens,
    p_observacoes: p.observacoes ?? null,
  });
  if (error) {
    if (error.code === "P0001" && error.hint !== "LIMITE_ATINGIDO") throw new AppError(400, error.message, "regra");
    console.error("pedido público", error);
    throw new AppError(503, "Não foi possível registrar o pedido agora. Fale com o representante pelo WhatsApp.", "indisponivel");
  }
  return data as ResultadoPedidoPublico;
}
