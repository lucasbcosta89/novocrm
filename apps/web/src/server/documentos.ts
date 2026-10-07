import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { idSchema } from "@/lib/validacao";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { salvarArquivo } from "./armazenamento";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";
import { verificarLimite } from "./quota";
import { dadosCatalogo, dadosComissoes, dadosMensal, limitesPeriodo, pdfCatalogo, pdfComissoes, pdfMensal } from "./relatorios";

export const TIPOS_DOCUMENTO = ["relatorio_periodo", "relatorio_comissao", "catalogo"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  relatorio_periodo: "Relatório mensal",
  relatorio_comissao: "Relatório de comissões",
  catalogo: "Catálogo",
};

const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Período inválido (use AAAA-MM)");

export const solicitacaoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("relatorio_periodo"), representada_id: idSchema, periodo: periodoSchema }),
  z.object({ tipo: z.literal("relatorio_comissao"), representada_id: idSchema, periodo: periodoSchema }),
  z.object({ tipo: z.literal("catalogo"), representada_id: z.union([idSchema, z.literal("todas")]) }),
]);
export type Solicitacao = z.infer<typeof solicitacaoSchema>;

export type Documento = {
  id: string;
  tipo: TipoDocumento;
  titulo: string | null;
  periodo: string | null;
  status: "gerando" | "pronto" | "falha";
  erro: string | null;
  tamanho: number | null;
  criado_em: string;
  gerado_em: string | null;
  representada: { nome: string } | null;
};

const CAMPOS = "id, tipo, titulo, periodo, status, erro, tamanho, criado_em, gerado_em, representada:representadas(nome)";
const VERSAO_LAYOUT = 1; // mudar invalida o cache de todos os PDFs

export const urlDownload = (id: string) => `/api/documentos/${id}/download`;

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Coleta os dados (com a sessão do usuário) e devolve o gerador do PDF. */
async function preparar(ctx: Contexto, s: Solicitacao) {
  if (s.tipo === "catalogo") {
    const dados = await dadosCatalogo(ctx, s.representada_id);
    if (dados.marcas.length === 0) throw new AppError(404, "Representada não encontrada", "nao_encontrado");
    const nome = s.representada_id === "todas" ? "todas as marcas" : dados.marcas[0]!.representada.nome;
    return { dados, titulo: `Catálogo — ${nome}`, gerar: () => pdfCatalogo(dados) };
  }
  const { rotulo } = limitesPeriodo(s.periodo);
  if (s.tipo === "relatorio_periodo") {
    const dados = await dadosMensal(ctx, s.representada_id, s.periodo);
    return { dados, titulo: `Relatório mensal — ${dados.representada.nome} — ${rotulo}`, gerar: () => pdfMensal(dados) };
  }
  const dados = await dadosComissoes(ctx, s.representada_id, s.periodo);
  return { dados, titulo: `Comissões — ${dados.representada.nome} — ${rotulo}`, gerar: () => pdfComissoes(dados) };
}

/** Gera o PDF fora do ciclo da requisição e marca o documento como pronto/falha. */
async function processar(id: string, userId: string, gerar: () => Promise<Uint8Array>) {
  const admin = supabaseAdmin();
  try {
    const pdf = await gerar();
    const chave = `documentos/${userId}/${id}.pdf`;
    await salvarArquivo(chave, pdf, "application/pdf");
    await admin
      .from("documentos")
      .update({ status: "pronto", r2_key: chave, tamanho: pdf.byteLength, gerado_em: new Date().toISOString(), erro: null })
      .eq("id", id);
  } catch (e) {
    console.error("PDF: falha ao gerar", id, e);
    await admin.from("documentos").update({ status: "falha", erro: e instanceof Error ? e.message : String(e) }).eq("id", id);
  }
}

/**
 * Pede um PDF. hash_cache = sha256(tipo + parâmetros + dados): se nada mudou, devolve o documento existente
 * sem regenerar nem consumir quota. Senão cria o registro (quota pdf_mes) e gera em segundo plano.
 */
export async function solicitarDocumento(ctx: Contexto, input: unknown): Promise<{ documento: Documento; url: string; cache: boolean }> {
  const s = solicitacaoSchema.parse(input);
  const { dados, titulo, gerar } = await preparar(ctx, s);
  const hash = await sha256(JSON.stringify({ v: VERSAO_LAYOUT, s, dados }));

  const { data: existente, error: e1 } = await ctx.supabase
    .from("documentos")
    .select(CAMPOS)
    .eq("hash_cache", hash)
    .maybeSingle<Documento>();
  if (e1) throw erroBanco(e1);

  if (existente && existente.status !== "falha") {
    return { documento: existente, url: urlDownload(existente.id), cache: true };
  }

  let doc: Documento;
  if (existente) {
    // nova tentativa de um que falhou: reaproveita o registro (não consome quota de novo)
    const { data, error } = await ctx.supabase
      .from("documentos")
      .update({ status: "gerando", erro: null })
      .eq("id", existente.id)
      .select(CAMPOS)
      .single<Documento>();
    if (error) throw erroBanco(error);
    doc = data;
  } else {
    await verificarLimite(ctx, "pdf_mes");
    const { data, error } = await ctx.supabase
      .from("documentos")
      .insert({
        user_id: ctx.userId,
        tipo: s.tipo,
        representada_id: s.representada_id === "todas" ? null : s.representada_id,
        periodo: "periodo" in s ? s.periodo : null,
        parametros: s,
        titulo,
        hash_cache: hash,
        r2_key: "",
        status: "gerando",
      })
      .select(CAMPOS)
      .single<Documento>();
    if (error) throw erroBanco(error, "Este documento já está sendo gerado");
    doc = data;
  }

  after(() => processar(doc.id, ctx.userId, gerar));
  return { documento: doc, url: urlDownload(doc.id), cache: false };
}

export async function listarDocumentos({ supabase }: Contexto): Promise<Documento[]> {
  const { data, error } = await supabase.from("documentos").select(CAMPOS).order("criado_em", { ascending: false }).limit(100).returns<Documento[]>();
  if (error) throw erroBanco(error);
  return data;
}

/** Chave do arquivo de um documento pronto do usuário (RLS garante o dono). */
export async function arquivoDocumento({ supabase }: Contexto, id: string): Promise<{ chave: string; titulo: string }> {
  const { data, error } = await supabase
    .from("documentos")
    .select("r2_key, status, titulo")
    .eq("id", idSchema.parse(id))
    .single<{ r2_key: string; status: string; titulo: string | null }>();
  if (error) throw erroBanco(error);
  if (data.status !== "pronto") throw new AppError(409, "Documento ainda não está pronto", "nao_pronto");
  return { chave: data.r2_key, titulo: data.titulo ?? "documento" };
}
