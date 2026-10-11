"use server";

import { comParam } from "@/lib/url";
import { executarAcao } from "@/server/acao";
import { solicitarDocumento } from "@/server/documentos";

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
