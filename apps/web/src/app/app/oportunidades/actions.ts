"use server";

import { executarAcao } from "@/server/acao";
import { criarFunil } from "@/server/funis";

const BASE = "/app/oportunidades";

export async function criarFunilAction(fd: FormData) {
  await executarAcao((ctx) => criarFunil(ctx, { nome: fd.get("nome"), modelo: fd.get("modelo") }), {
    ok: BASE,
    erro: BASE,
    mensagem: "Funil criado",
  });
}
