"use server";

import { comParam } from "@/lib/url";
import { executarAcao } from "@/server/acao";
import { obterContexto } from "@/server/contexto";
import { solicitarDocumento } from "@/server/documentos";
import { normalizarErro } from "@/server/erros";

/** Gera PDF (relatórios gerais, catálogo geral ou catálogo da representada) e volta para a página de origem. */
export async function gerarDocumentoAction(voltar: string, fd: FormData) {
  const tipo = String(fd.get("tipo") ?? "");
  const representada_id = String(fd.get("representada_id") ?? "");
  const input =
    tipo === "catalogo_geral" ? { tipo }
    : tipo === "catalogo" ? { tipo, representada_id }
    : { tipo, representada_id, periodo: fd.get("periodo") };
  let destino = voltar;
  await executarAcao(
    async (ctx) => {
      const r = await solicitarDocumento(ctx, input);
      destino = comParam(voltar, "ok", r.cache ? "Nada mudou desde a última geração: PDF reaproveitado (não consumiu quota)." : "Gerando PDF… ele aparece na lista em instantes.");
    },
    { ok: () => destino, erro: voltar },
  );
}

/** Catálogo PDF sem redirecionar (Fase 3d-2): devolve o documento para o botão acompanhar e baixar. */
export async function solicitarCatalogoPdfAction(
  representadaId: string,
): Promise<{ id?: string; url?: string; status?: string; erro?: string }> {
  try {
    const r = await solicitarDocumento(await obterContexto(), { tipo: "catalogo", representada_id: representadaId });
    return { id: r.documento.id, url: r.url, status: r.documento.status };
  } catch (e) {
    return { erro: normalizarErro(e).message };
  }
}
