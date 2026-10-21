import "server-only";
import { idSchema } from "@/lib/validacao";
import { salvarArquivo } from "./armazenamento";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

/** Documentos da representada: tabela uploads com tipo 'documento_representada' (arquivo no R2/Storage). */
export const TIPO_DOC_REPRESENTADA = "documento_representada";
const MAX_ARQUIVO = 10 * 1024 * 1024;
const MAX_ARQUIVOS = 10;
const EXTENSOES = /\.(pdf|png|jpe?g|webp|docx?|xlsx?|csv|txt)$/i;

export type DocumentoRepresentada = { id: string; nome: string; criado_em: string };

const nomeArquivo = (chave: string) => decodeURIComponent(chave.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, ""));

export async function listarDocumentosRepresentada({ supabase }: Contexto, representadaId: string): Promise<DocumentoRepresentada[]> {
  const { data, error } = await supabase
    .from("uploads")
    .select("id, r2_key, criado_em")
    .eq("representada_id", idSchema.parse(representadaId))
    .eq("tipo", TIPO_DOC_REPRESENTADA)
    .order("criado_em", { ascending: false })
    .returns<{ id: string; r2_key: string; criado_em: string }[]>();
  if (error) throw erroBanco(error);
  return data.map((d) => ({ id: d.id, nome: nomeArquivo(d.r2_key), criado_em: d.criado_em }));
}

/** Upload múltiplo (até 10 arquivos de 10 MB: PDF, imagens, Office, CSV/TXT). */
export async function salvarDocumentosRepresentada(ctx: Contexto, representadaId: string, arquivos: unknown[]): Promise<number> {
  const id = idSchema.parse(representadaId);
  const validos = arquivos.filter((a): a is File => a instanceof File && a.size > 0);
  if (validos.length === 0) return 0;
  if (validos.length > MAX_ARQUIVOS) throw new AppError(400, `Envie no máximo ${MAX_ARQUIVOS} documentos por vez`, "validacao");
  for (const a of validos) {
    if (a.size > MAX_ARQUIVO) throw new AppError(400, `“${a.name}” passa de 10 MB`, "validacao");
    if (!EXTENSOES.test(a.name)) throw new AppError(400, `Tipo de arquivo não aceito: “${a.name}”`, "validacao");
  }
  for (const a of validos) {
    const nome = encodeURIComponent(a.name.replace(/[/\\]/g, "_").slice(0, 120));
    const chave = `representadas/${ctx.userId}/${id}/${crypto.randomUUID()}-${nome}`;
    await salvarArquivo(chave, new Uint8Array(await a.arrayBuffer()), a.type || "application/octet-stream");
    const { error } = await ctx.supabase.from("uploads").insert({ user_id: ctx.userId, representada_id: id, tipo: TIPO_DOC_REPRESENTADA, r2_key: chave });
    if (error) throw erroBanco(error);
  }
  return validos.length;
}

/** Chave e nome do arquivo de um upload do próprio usuário (RLS). */
export async function arquivoUpload({ supabase }: Contexto, id: string): Promise<{ chave: string; nome: string }> {
  const { data, error } = await supabase.from("uploads").select("r2_key").eq("id", idSchema.parse(id)).single<{ r2_key: string }>();
  if (error) throw erroBanco(error);
  return { chave: data.r2_key, nome: nomeArquivo(data.r2_key) };
}
