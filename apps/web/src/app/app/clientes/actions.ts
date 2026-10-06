"use server";

import { executarAcao } from "@/server/acao";
import { atualizarCliente, criarCliente, desvincular, excluirCliente, vincular } from "@/server/clientes";
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
