"use server";

import { executarAcao } from "@/server/acao";
import { solicitarDocumento } from "@/server/documentos";

export async function gerarDocumentoAction(fd: FormData) {
  const tipo = fd.get("tipo");
  const input =
    tipo === "catalogo"
      ? { tipo, representada_id: fd.get("representada_id") }
      : { tipo, representada_id: fd.get("representada_id"), periodo: fd.get("periodo") };
  let mensagem = "";
  await executarAcao(
    async (ctx) => {
      const r = await solicitarDocumento(ctx, input);
      mensagem = r.cache
        ? "Nada mudou desde a última geração: documento reaproveitado do cache (não consumiu quota)."
        : "Gerando PDF… a lista atualiza sozinha.";
      return r;
    },
    { ok: () => `/app/relatorios?ok=${encodeURIComponent(mensagem)}`, erro: "/app/relatorios" },
  );
}
