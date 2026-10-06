"use server";

import { executarAcao } from "@/server/acao";
import { atualizarProduto, criarProduto, excluirProduto } from "@/server/produtos";
import { atualizarRepresentada, criarRepresentada, excluirRepresentada } from "@/server/representadas";

const BASE = "/app/representadas";
const dados = (fd: FormData) => Object.fromEntries(fd);

export async function criarRepresentadaAction(fd: FormData) {
  await executarAcao((ctx) => criarRepresentada(ctx, dados(fd)), {
    ok: (r) => `${BASE}/${r.id}`,
    erro: BASE,
    mensagem: "Representada criada",
  });
}

export async function atualizarRepresentadaAction(id: string, fd: FormData) {
  await executarAcao((ctx) => atualizarRepresentada(ctx, id, dados(fd)), {
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
    ok: `${BASE}/${representadaId}`,
    erro: `${BASE}/${representadaId}`,
    mensagem: "Produto adicionado",
  });
}

export async function atualizarProdutoAction(representadaId: string, produtoId: string, fd: FormData) {
  // Checkbox desmarcado não é enviado: ausência = inativo.
  const input = { ...dados(fd), ativo: fd.get("ativo") === "on" };
  await executarAcao((ctx) => atualizarProduto(ctx, produtoId, input), {
    ok: `${BASE}/${representadaId}`,
    erro: `${BASE}/${representadaId}`,
    mensagem: "Produto salvo",
  });
}

export async function excluirProdutoAction(representadaId: string, produtoId: string) {
  await executarAcao((ctx) => excluirProduto(ctx, produtoId), {
    ok: `${BASE}/${representadaId}`,
    erro: `${BASE}/${representadaId}`,
    mensagem: "Produto excluído",
  });
}
