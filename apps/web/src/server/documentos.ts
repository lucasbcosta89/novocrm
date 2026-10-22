import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { idSchema } from "@/lib/validacao";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { salvarArquivo } from "./armazenamento";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";
import type { Representante } from "@/lib/pdf";
import { revelarDocumentos } from "./perfil";
import { verificarLimite } from "./quota";
import {
  dadosCatalogo, dadosComissoes, dadosMensal, idsRepresentadas, limitesPeriodo,
  pdfCatalogo, pdfComissoes, pdfComissoesGeral, pdfMensal, pdfMensalGeral,
} from "./relatorios";
import {
  dadosKpis, dadosVendasCliente, dadosVendasGeral, dadosVendasRepresentada,
  pdfKpis, pdfVendasCliente, pdfVendasGeral, pdfVendasRepresentada,
} from "./relatorios-biblioteca";

export const TIPOS_DOCUMENTO = [
  "relatorio_periodo", "relatorio_comissao", "catalogo", "catalogo_geral",
  "relatorio_vendas_geral", "relatorio_vendas_cliente", "relatorio_vendas_representada", "relatorio_kpis",
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const ROTULO_DOCUMENTO: Record<TipoDocumento, string> = {
  relatorio_periodo: "Relatório mensal",
  relatorio_comissao: "Relatório de comissões",
  catalogo: "Catálogo",
  catalogo_geral: "Catálogo geral",
  relatorio_vendas_geral: "Vendas — Geral",
  relatorio_vendas_cliente: "Vendas — Por cliente",
  relatorio_vendas_representada: "Vendas — Por representada",
  relatorio_kpis: "KPIs",
};

/** Mês "AAAA-MM" ou intervalo "AAAA-MM-DD_AAAA-MM-DD" (até 366 dias). */
export const periodoSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$|^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/, "Período inválido (use AAAA-MM ou um intervalo de datas)")
  .refine((p) => {
    if (!p.includes("_")) return true;
    const [de, ate] = p.split("_") as [string, string];
    const dias = (Date.parse(ate) - Date.parse(de)) / 86_400_000;
    return !Number.isNaN(dias) && dias >= 0 && dias <= 366;
  }, "Intervalo inválido: a data final deve ser igual ou posterior à inicial (máx. 366 dias)");
/** "todas" = relatório geral (todas as representadas do usuário em um documento). */
const representadaOuTodas = z.union([idSchema, z.literal("todas")]);

export const solicitacaoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("relatorio_periodo"), representada_id: representadaOuTodas, periodo: periodoSchema }),
  z.object({ tipo: z.literal("relatorio_comissao"), representada_id: representadaOuTodas, periodo: periodoSchema }),
  z.object({ tipo: z.literal("catalogo"), representada_id: idSchema }),
  z.object({ tipo: z.literal("catalogo_geral") }),
  z.object({ tipo: z.literal("relatorio_vendas_geral"), periodo: periodoSchema }),
  z.object({ tipo: z.literal("relatorio_vendas_cliente"), cliente_id: z.uuid("Selecione o cliente"), periodo: periodoSchema }),
  z.object({ tipo: z.literal("relatorio_vendas_representada"), representada_id: z.uuid("Selecione a representada"), periodo: periodoSchema }),
  z.object({ tipo: z.literal("relatorio_kpis"), periodo: periodoSchema }),
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
const VERSAO_LAYOUT = 2; // mudar invalida o cache de todos os PDFs (2 = template da Fase 7b)

export const urlDownload = (id: string) => `/api/documentos/${id}/download`;

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Coleta os dados (com a sessão do usuário) e devolve o gerador do PDF. */
/** Cabeçalho do template: nome, empresa e CNPJ do representante (CPF nunca entra no PDF). */
async function representante(ctx: Contexto): Promise<Representante> {
  const [{ data }, docs] = await Promise.all([
    ctx.supabase.from("usuarios").select("nome, nome_empresa").eq("id", ctx.userId).single<{ nome: string; nome_empresa: string | null }>(),
    revelarDocumentos(ctx),
  ]);
  return { nome: data?.nome ?? "", nome_empresa: data?.nome_empresa ?? null, cnpj: docs.cnpj };
}

async function preparar(ctx: Contexto, s: Solicitacao, rep: Representante) {
  if (s.tipo === "catalogo" || s.tipo === "catalogo_geral") {
    const geral = s.tipo === "catalogo_geral";
    const dados = await dadosCatalogo(ctx, geral ? "todas" : s.representada_id);
    if (dados.marcas.length === 0) throw new AppError(404, geral ? "Cadastre uma representada primeiro" : "Representada não encontrada", "nao_encontrado");
    return { dados, titulo: geral ? "Catálogo Geral" : `Catálogo — ${dados.marcas[0]!.representada.nome}`, gerar: () => pdfCatalogo(dados, rep) };
  }
  const { rotulo } = limitesPeriodo(s.periodo);
  // Biblioteca (Fase 10): vendas e KPIs
  if (s.tipo === "relatorio_vendas_geral") {
    const dados = await dadosVendasGeral(ctx, s.periodo);
    return { dados, titulo: `Vendas — Geral — ${rotulo}`, gerar: () => pdfVendasGeral(dados, rep) };
  }
  if (s.tipo === "relatorio_vendas_cliente") {
    const dados = await dadosVendasCliente(ctx, s.periodo, s.cliente_id);
    return { dados, titulo: `Vendas — ${dados.cliente.nome} — ${rotulo}`, gerar: () => pdfVendasCliente(dados, rep) };
  }
  if (s.tipo === "relatorio_vendas_representada") {
    const dados = await dadosVendasRepresentada(ctx, s.periodo, s.representada_id);
    return { dados, titulo: `Vendas — ${dados.representada.nome} — ${rotulo}`, gerar: () => pdfVendasRepresentada(dados, rep) };
  }
  if (s.tipo === "relatorio_kpis") {
    const dados = await dadosKpis(ctx, s.periodo);
    return { dados, titulo: `KPIs — ${rotulo}`, gerar: () => pdfKpis(dados, rep) };
  }
  const ids = s.representada_id === "todas" ? await idsRepresentadas(ctx) : null;
  if (ids && ids.length === 0) throw new AppError(404, "Cadastre uma representada primeiro", "nao_encontrado");
  if (s.tipo === "relatorio_periodo") {
    if (ids) {
      const dados = await Promise.all(ids.map((id) => dadosMensal(ctx, id, s.periodo)));
      return { dados, titulo: `Relatório Mensal (Geral) — ${rotulo}`, gerar: () => pdfMensalGeral(dados, s.periodo, rep) };
    }
    const dados = await dadosMensal(ctx, s.representada_id, s.periodo);
    return { dados, titulo: `Relatório mensal — ${dados.representada.nome} — ${rotulo}`, gerar: () => pdfMensal(dados, rep) };
  }
  if (ids) {
    const dados = await Promise.all(ids.map((id) => dadosComissoes(ctx, id, s.periodo)));
    return { dados, titulo: `Relatório de Comissões (Geral) — ${rotulo}`, gerar: () => pdfComissoesGeral(dados, s.periodo, rep) };
  }
  const dados = await dadosComissoes(ctx, s.representada_id, s.periodo);
  return { dados, titulo: `Comissões — ${dados.representada.nome} — ${rotulo}`, gerar: () => pdfComissoes(dados, rep) };
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
  const rep = await representante(ctx);
  const { dados, titulo, gerar } = await preparar(ctx, s, rep);
  const hash = await sha256(JSON.stringify({ v: VERSAO_LAYOUT, s, dados, rep }));

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
        representada_id: "representada_id" in s && s.representada_id !== "todas" ? s.representada_id : null,
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

/** filtro: documentos de uma representada ou os gerais (sem representada). */
export async function listarDocumentos(
  { supabase }: Contexto,
  filtro?: { representada_id: string } | { geral: true },
  limite = 100,
): Promise<Documento[]> {
  let q = supabase.from("documentos").select(CAMPOS);
  if (filtro && "geral" in filtro) q = q.is("representada_id", null);
  else if (filtro) q = q.eq("representada_id", idSchema.parse(filtro.representada_id));
  const { data, error } = await q.order("criado_em", { ascending: false }).limit(limite).returns<Documento[]>();
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
