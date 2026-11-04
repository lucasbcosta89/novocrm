"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { validarRepresentada, type CampoRepresentada } from "@/lib/cadastros/representada";
import { comParam } from "@/lib/url";
import { idSchema } from "@/lib/validacao";
import { vincularPendentesAoProduto, vincularProdutoPendentes } from "@/server/pedidos";
import { executarAcao } from "@/server/acao";
import { obterContexto } from "@/server/contexto";
import { normalizarErro } from "@/server/erros";
import { atualizarPrecos, atualizarProduto, criarProduto, excluirProduto, salvarImagemProduto } from "@/server/produtos";
import { excluirDocumentoRepresentada, salvarDocumentosRepresentada } from "@/server/documentos-representada";
import { atualizarPonto, criarPonto, excluirPonto } from "@/server/pontos-faturamento";
import { alterarStatusRepresentada, atualizarRepresentada, criarRepresentada, excluirRepresentada } from "@/server/representadas";

const BASE = "/app/representadas";
/** Campos de texto do formulário (arquivos ficam de fora). */
const dados = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));

/** Estado do formulário de representada (useActionState). */
export type EstadoFormRepresentada = {
  erros?: Partial<Record<CampoRepresentada, string>>;
  erro?: string;
  ok?: string;
  /** muda a cada "Salvar e adicionar outra" bem-sucedido: o formulário limpa os campos */
  limpar?: number;
};

/**
 * Cria (id null) ou edita a representada. Validação completa por campo antes do banco; erros do banco ligados a
 * um campo (CNPJ duplicado etc.) voltam para baixo do campo, sem perder o que foi digitado.
 * depois=outra (só ao criar): grava e devolve o formulário limpo na mesma tela.
 */
export async function salvarRepresentadaAction(id: string | null, _prev: EstadoFormRepresentada, fd: FormData): Promise<EstadoFormRepresentada> {
  const valores = dados(fd);
  const erros = validarRepresentada(valores);
  if (Object.keys(erros).length) return { erros, erro: "Corrija os campos destacados." };
  const entrada = { ...valores, catalogo_publico: fd.get("catalogo_publico") === "on", criar_pedido_publico: fd.get("criar_pedido_publico") === "on" };
  let destino: string;
  try {
    const ctx = await obterContexto();
    if (id) {
      await atualizarRepresentada(ctx, id, entrada);
      destino = comParam(`${BASE}/${id}`, "ok", "Representada salva");
    } else {
      const r = await criarRepresentada(ctx, entrada);
      if (fd.get("depois") === "outra") return { ok: `Representada ${r.codigo_representada} — ${r.razao_social} criada. Cadastre a próxima.`, limpar: Date.now() };
      destino = comParam(`${BASE}/${r.id}`, "ok", `Representada ${r.codigo_representada} criada`);
    }
  } catch (e) {
    unstable_rethrow(e);
    const erro = normalizarErro(e);
    if (erro.status === 401) redirect("/login");
    if (erro.code?.startsWith("campo:")) return { erros: { [erro.code.slice(6)]: erro.message }, erro: "Corrija os campos destacados." };
    return { erro: erro.message };
  }
  redirect(destino);
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

export async function excluirDocumentoAction(representadaId: string, documentoId: string) {
  await executarAcao((ctx) => excluirDocumentoRepresentada(ctx, documentoId), {
    ok: `${BASE}/${representadaId}#documentos`,
    erro: `${BASE}/${representadaId}#documentos`,
    mensagem: "Documento excluído",
  });
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

/** Inativar/reativar pela listagem; volta para a mesma visão (filtros, ordem e página). */
export async function alterarStatusRepresentadaAction(id: string, status: "ativa" | "inativa", voltar: string) {
  const destino = voltar.startsWith(BASE) ? voltar : BASE;
  await executarAcao((ctx) => alterarStatusRepresentada(ctx, id, status), {
    ok: destino,
    erro: destino,
    mensagem: status === "inativa" ? "Representada inativada" : "Representada reativada",
  });
}

export async function excluirRepresentadaAction(id: string) {
  await executarAcao((ctx) => excluirRepresentada(ctx, id), {
    ok: BASE,
    erro: `${BASE}/${id}`,
    mensagem: "Representada removida permanentemente; a vaga do plano foi liberada",
  });
}

/**
 * Novo produto. Sempre vincula os itens de pedidos importados que estavam pendentes com o mesmo SKU (o preço dos
 * itens não muda). voltar_pedido (vindo de "Cadastrar produto" na página do pedido): volta para aquele pedido.
 */
export async function criarProdutoAction(representadaId: string, fd: FormData) {
  const voltarPedido = idSchema.safeParse(fd.get("voltar_pedido")).data;
  let mensagem = "Produto adicionado";
  await executarAcao(
    async (ctx) => {
      const p = await criarProduto(ctx, representadaId, dados(fd));
      const vinculados = await vincularPendentesAoProduto(ctx, p.id);
      if (vinculados) mensagem = `Produto adicionado e vinculado a ${vinculados} item(ns) de pedido pendente(s)`;
      return p;
    },
    {
      ok: () => comParam(voltarPedido ? `/app/pedidos/${voltarPedido}` : `${BASE}/${representadaId}/catalogo`, "ok", mensagem),
      erro: voltarPedido ? `${BASE}/${representadaId}/catalogo?voltar_pedido=${voltarPedido}#novo-produto` : `${BASE}/${representadaId}/catalogo`,
    },
  );
}

/** "Vincular produto" (alerta do Catálogo, caso 2): SKU já cadastrado, liga os itens pendentes a ele. */
export async function vincularProdutoPendentesAction(representadaId: string, sku: string) {
  let mensagem = "";
  await executarAcao(
    async (ctx) => { const n = await vincularProdutoPendentes(ctx, representadaId, sku); mensagem = `${n} item(ns) de pedido vinculado(s) ao SKU ${sku}`; },
    { ok: () => comParam(`${BASE}/${representadaId}/catalogo`, "ok", mensagem), erro: `${BASE}/${representadaId}/catalogo` },
  );
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

/** Tabela de preços editável: só chega aqui depois da confirmação no navegador. */
export async function salvarPrecosAction(representadaId: string, alteracoes: { id: string; preco: number; desconto_max: number }[]) {
  try {
    const n = await atualizarPrecos(await obterContexto(), representadaId, alteracoes);
    return { ok: `${n} preço(s) salvo(s)` };
  } catch (e) {
    return { erro: normalizarErro(e).message };
  }
}
