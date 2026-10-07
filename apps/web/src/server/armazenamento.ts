import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AppError } from "./erros";

/**
 * Armazenamento de arquivos privados (PDFs, imagens de produto).
 * Usa o bucket R2 (binding ARQUIVOS no wrangler.jsonc) quando existir; senão o Supabase Storage
 * (bucket privado "arquivos"). Downloads sempre passam por rota autenticada.
 */
type R2Bucket = {
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
};

const BUCKET = "arquivos";

function r2(): R2Bucket | null {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, unknown>;
    return (env.ARQUIVOS as R2Bucket | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function salvarArquivo(chave: string, conteudo: Uint8Array, contentType: string): Promise<void> {
  const bucket = r2();
  if (bucket) {
    await bucket.put(chave, conteudo, { httpMetadata: { contentType } });
    return;
  }
  const { error } = await supabaseAdmin().storage.from(BUCKET).upload(chave, conteudo, { contentType, upsert: true });
  if (error) throw new AppError(500, `Falha ao salvar arquivo: ${error.message}`, "armazenamento");
}

export async function lerArquivo(chave: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const bucket = r2();
  if (bucket) {
    const obj = await bucket.get(chave);
    return obj ? { bytes: await obj.arrayBuffer(), contentType: obj.httpMetadata?.contentType ?? "application/octet-stream" } : null;
  }
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).download(chave);
  if (error || !data) return null;
  return { bytes: await data.arrayBuffer(), contentType: data.type || "application/octet-stream" };
}
