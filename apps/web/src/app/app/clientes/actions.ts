"use server";

import { executarAcao } from "@/server/acao";
import { atualizarCliente, criarCliente, desvincular, excluirCliente, vincular } from "@/server/clientes";
import {
  atualizarAcao,
  atualizarOportunidade,
  criarAcao,
  criarOportunidade,
  excluirAcao,
  excluirOportunidade,
} from "@/server/oportunidades";
import { atualizarVisita, criarVisita, excluirVisita } from "@/server/visitas";

const BASE = "/app/clientes";
const dados = (fd: FormData) => Object.fromEntries(fd);

export async function criarClienteAction(fd: FormData) {
  await executarAcao((ctx) => criarCliente(ctx, dados(fd)), {
    ok: (c) => `${BASE}/${c.id}`,
    erro: BASE,
    mensagem: "Cliente criado. Vincule-o às representadas abaixo.",
  });
}

export async function atualizarClienteAction(id: string, fd: FormData) {
  await executarAcao((ctx) => atualizarCliente(ctx, id, dados(fd)), {
    ok: `${BASE}/${id}`,
    erro: `${BASE}/${id}`,
    mensagem: "Cliente salvo",
  });
}

export async function excluirClienteAction(id: string) {
  await executarAcao((ctx) => excluirCliente(ctx, id), {
    ok: BASE,
    erro: `${BASE}/${id}`,
    mensagem: "Cliente excluído",
  });
}

export async function vincularUmaAction(id: string, representadaId: string) {
  await executarAcao((ctx) => vincular(ctx, id, representadaId), {
    ok: `${BASE}/${id}`,
    erro: `${BASE}/${id}`,
    mensagem: "Representada vinculada",
  });
}

export async function desvincularAction(id: string, representadaId: string) {
  await executarAcao((ctx) => desvincular(ctx, id, representadaId), {
    ok: `${BASE}/${id}`,
    erro: `${BASE}/${id}`,
    mensagem: "Representada desvinculada",
  });
}

export async function criarVisitaAction(id: string, fd: FormData) {
  await executarAcao((ctx) => criarVisita(ctx, id, dados(fd)), {
    ok: `${BASE}/${id}#visitas`,
    erro: `${BASE}/${id}`,
    mensagem: "Visita registrada",
  });
}

export async function atualizarVisitaAction(id: string, visitaId: string, fd: FormData) {
  await executarAcao((ctx) => atualizarVisita(ctx, visitaId, dados(fd)), {
    ok: `${BASE}/${id}#visitas`,
    erro: `${BASE}/${id}`,
    mensagem: "Visita salva",
  });
}

export async function excluirVisitaAction(id: string, visitaId: string) {
  await executarAcao((ctx) => excluirVisita(ctx, visitaId), {
    ok: `${BASE}/${id}#visitas`,
    erro: `${BASE}/${id}`,
    mensagem: "Visita excluída",
  });
}

const OPS = (id: string) => `${BASE}/${id}#oportunidades`;
const PLANO = (id: string, opId: string) => `${BASE}/${id}/oportunidades/${opId}`;

export async function criarOportunidadeAction(id: string, fd: FormData) {
  await executarAcao((ctx) => criarOportunidade(ctx, id, dados(fd)), {
    ok: (o) => PLANO(id, o.id),
    erro: OPS(id),
    mensagem: "Item criado. Monte o plano de ação.",
  });
}

/** `voltar` = página de origem (lista do cliente ou plano de ação). */
export async function atualizarOportunidadeAction(id: string, opId: string, voltar: "lista" | "plano", fd: FormData) {
  const destino = voltar === "lista" ? OPS(id) : PLANO(id, opId);
  await executarAcao((ctx) => atualizarOportunidade(ctx, opId, dados(fd)), { ok: destino, erro: destino, mensagem: "Item atualizado" });
}

export async function excluirOportunidadeAction(id: string, opId: string) {
  await executarAcao((ctx) => excluirOportunidade(ctx, opId), { ok: OPS(id), erro: OPS(id), mensagem: "Item excluído" });
}

export async function criarAcaoAction(id: string, opId: string, fd: FormData) {
  const destino = PLANO(id, opId);
  await executarAcao((ctx) => criarAcao(ctx, opId, dados(fd)), { ok: destino, erro: destino, mensagem: "Ação adicionada" });
}

export async function atualizarAcaoAction(id: string, opId: string, acaoId: string, fd: FormData) {
  const destino = PLANO(id, opId);
  await executarAcao((ctx) => atualizarAcao(ctx, acaoId, dados(fd)), { ok: destino, erro: destino, mensagem: "Ação atualizada" });
}

export async function excluirAcaoAction(id: string, opId: string, acaoId: string) {
  const destino = PLANO(id, opId);
  await executarAcao((ctx) => excluirAcao(ctx, acaoId), { ok: destino, erro: destino, mensagem: "Ação excluída" });
}
