"use server";

import { comParam } from "@/lib/url";
import { executarAcao } from "@/server/acao";
import { atualizarProduto, criarProduto, excluirProduto, salvarImagemProduto } from "@/server/produtos";
import { salvarDocumentosRepresentada } from "@/server/documentos-representada";
import { atualizarPonto, criarPonto, excluirPonto } from "@/server/pontos-faturamento";
import { atualizarRepresentada, criarRepresentada, excluirRepresentada } from "@/server/representadas";

const BASE = "/app/representadas";
/** Campos de texto do formulário (arquivos ficam de fora). */
const dados = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));

export async function criarRepresentadaAction(fd: FormData) {
  let mensagem = "Representada criada";
  await executarAcao(
    async (ctx) => {
      const r = await criarRepresentada(ctx, dados(fd));
      // documentos enviados junto com o cadastro (uploads tipo documento_representada)
      try {
        const n = await salvarDocumentosRepresentada(ctx, r.id, fd.getAll("documentos"));
        if (n) mensagem = `Representada criada com ${n} documento(s)`;
      } catch (e) {
        mensagem = `Representada criada, mas os documentos não foram salvos: ${e instanceof Error ? e.message : "erro"}`;
      }
      return r;
    },
    { ok: () => comParam(BASE, "ok", mensagem), erro: BASE },
  );
}

export async function enviarDocumentosAction(id: string, fd: FormData) {
  let mensagem = "";
  await executarAcao(
    async (ctx) => {
      const n = await salvarDocumentosRepresentada(ctx, id, fd.getAll("documentos"));
      mensagem = n ? `${n} documento(s) enviado(s)` : "Nenhum arquivo selecionado";
    },
    { ok: () => comParam(`${BASE}/${id}`, "ok", mensagem), erro: `${BASE}/${id}` },
  );
}

/* Pontos de faturamento */

export async function criarPontoAction(representadaId: string, fd: FormData) {
  await executarAcao((ctx) => criarPonto(ctx, representadaId, dados(fd)), {
    ok: `${BASE}/${representadaId}#pontos`,
    erro: `${BASE}/${representadaId}#pontos`,
    mensagem: "Ponto de faturamento cadastrado",
  });
}

export async function atualizarPontoAction(representadaId: string, pontoId: string, fd: FormData) {
  await executarAcao((ctx) => atualizarPonto(ctx, pontoId, dados(fd)), {
    ok: `${BASE}/${representadaId}#pontos`,
    erro: `${BASE}/${representadaId}#pontos`,
    mensagem: "Ponto de faturamento salvo",
  });
}

export async function excluirPontoAction(representadaId: string, pontoId: string) {
  await executarAcao((ctx) => excluirPonto(ctx, pontoId), {
    ok: `${BASE}/${representadaId}#pontos`,
    erro: `${BASE}/${representadaId}#pontos`,
    mensagem: "Ponto de faturamento excluído",
  });
}

export async function atualizarRepresentadaAction(id: string, fd: FormData) {
  // checkbox desmarcado não é enviado: ausência = false
  const input = { ...dados(fd), catalogo_publico: fd.get("catalogo_publico") === "on", criar_pedido_publico: fd.get("criar_pedido_publico") === "on" };
  await executarAcao((ctx) => atualizarRepresentada(ctx, id, input), {
    ok: `${BASE}/${id}`,
    erro: `${BASE}/${id}`,
    mensagem: "Representada salva",
  });
}

export async function excluirRepresentadaAction(id: string) {
  await executarAcao((ctx) => excluirRepresentada(ctx, id), {
    ok: BASE,
    erro: `${BASE}/${id}`,
    mensagem: "Representada excluída",
  });
}

export async function criarProdutoAction(representadaId: string, fd: FormData) {
  await executarAcao((ctx) => criarProduto(ctx, representadaId, dados(fd)), {
    ok: `${BASE}/${representadaId}/catalogo`,
    erro: `${BASE}/${representadaId}/catalogo`,
    mensagem: "Produto adicionado",
  });
}

export async function atualizarProdutoAction(representadaId: string, produtoId: string, fd: FormData) {
  // Checkbox desmarcado não é enviado: ausência = inativo.
  const input = { ...dados(fd), ativo: fd.get("ativo") === "on" };
  await executarAcao((ctx) => atualizarProduto(ctx, produtoId, input), {
    ok: `${BASE}/${representadaId}/catalogo`,
    erro: `${BASE}/${representadaId}/catalogo`,
    mensagem: "Produto salvo",
  });
}

export async function excluirProdutoAction(representadaId: string, produtoId: string) {
  await executarAcao((ctx) => excluirProduto(ctx, produtoId), {
    ok: `${BASE}/${representadaId}/catalogo`,
    erro: `${BASE}/${representadaId}/catalogo`,
    mensagem: "Produto excluído",
  });
}

export async function imagemProdutoAction(representadaId: string, produtoId: string, fd: FormData) {
  await executarAcao((ctx) => salvarImagemProduto(ctx, produtoId, fd.get("imagem")), {
    ok: `${BASE}/${representadaId}/catalogo`,
    erro: `${BASE}/${representadaId}/catalogo`,
    mensagem: "Imagem atualizada",
  });
}
