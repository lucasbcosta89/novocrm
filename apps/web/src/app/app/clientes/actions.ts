"use server";

import { executarAcao } from "@/server/acao";
import { atualizarCliente, criarCliente, excluirCliente, vincularRepresentadas } from "@/server/clientes";

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

export async function vincularAction(id: string, fd: FormData) {
  const input = { representada_ids: fd.getAll("representada_ids").map(String) };
  await executarAcao((ctx) => vincularRepresentadas(ctx, id, input), {
    ok: `${BASE}/${id}`,
    erro: `${BASE}/${id}`,
    mensagem: "Vínculos atualizados",
  });
}
