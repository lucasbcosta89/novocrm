"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseNcm, parseNumero, parsePercentual } from "@/lib/import/valores";
import { obterContexto } from "@/server/contexto";
import { AppError, erroBanco } from "@/server/erros";

/**
 * Importação de produtos por planilha (Server Action).
 * preview: valida e devolve contagens, erros e amostra — não grava nada.
 * commit: grava as linhas válidas (upsert por representada + SKU, lotes de 500) e o resumo em importacoes.
 * As linhas vêm cruas do front, já mapeadas pelos campos do modelo (lib/import/validarCabecalho).
 */

const LOTE = 500;
const MAX_ERROS_SALVOS = 200;

export type ErroLinha = { linha: number; campo: string; mensagem: string };
export type LinhaValida = z.infer<typeof linhaSchema>;
export type ResultadoPreview = { modo: "preview"; total: number; validas: number; erros: ErroLinha[]; amostra: LinhaValida[] };
export type ResultadoCommit = { modo: "commit"; total: number; inseridos: number; atualizados: number; erros: ErroLinha[] };

/** Texto da célula: aparado; vazio vira undefined (campo ausente). */
const texto = (v: unknown) => {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
};
/** Número opcional: vazio → null; texto que não é número → NaN (gera erro de validação). */
const numeroOuNulo = (parse: (v: unknown) => number | null) => (v: unknown) => (texto(v) === undefined ? null : (parse(v) ?? Number.NaN));

const linhaSchema = z.object({
  sku: z.preprocess(texto, z.string("Informe o SKU").max(60, "SKU com mais de 60 caracteres")),
  nome: z.preprocess(texto, z.string("Informe o nome").min(2, "Nome com menos de 2 caracteres").max(200, "Nome com mais de 200 caracteres")),
  unidade: z.preprocess(
    (v) => texto(v)?.toUpperCase() ?? "UN",
    z.string().max(10, "Unidade com mais de 10 caracteres"),
  ),
  ncm: z.unknown().transform((v, ctx) => {
    if (texto(v) === undefined) {
      ctx.addIssue({ code: "custom", message: "Informe o NCM" });
      return z.NEVER;
    }
    const ncm = parseNcm(v);
    if (!ncm) {
      ctx.addIssue({ code: "custom", message: "NCM deve ter exatamente 8 dígitos" });
      return z.NEVER;
    }
    return ncm;
  }),
  categoria: z.preprocess((v) => texto(v) ?? null, z.string().max(80, "Categoria com mais de 80 caracteres").nullable()),
  preco_padrao: z.preprocess(numeroOuNulo(parseNumero), z.number("Preço padrão inválido").min(0, "Preço padrão não pode ser negativo").nullable()),
  desconto_maximo: z.preprocess(
    (v) => numeroOuNulo(parsePercentual)(v) ?? 0,
    z.number("Desconto máximo inválido").min(0, "Desconto máximo deve estar entre 0 e 100").max(100, "Desconto máximo deve estar entre 0 e 100"),
  ),
  comissao: z.preprocess(
    (v) => numeroOuNulo(parsePercentual)(v) ?? 0,
    z.number("Comissão inválida").min(0, "Comissão deve estar entre 0 e 100").max(100, "Comissão deve estar entre 0 e 100"),
  ),
  descricao: z.preprocess((v) => texto(v) ?? null, z.string().max(2000, "Descrição com mais de 2000 caracteres").nullable()),
});

const entradaSchema = z.object({
  representada_id: z.uuid("Representada inválida"),
  arquivo: z.string("Informe o nome do arquivo").trim().min(1, "Informe o nome do arquivo").max(255, "Nome do arquivo com mais de 255 caracteres"),
  modo: z.enum(["preview", "commit"], "Modo deve ser preview ou commit"),
  linhas: z.array(z.record(z.string(), z.unknown())).min(1, "A planilha não tem linhas de dados").max(5000, "Máximo de 5000 linhas por importação"),
});

/** Valida todas as linhas: número real da linha na planilha (dados começam na 2) e SKU repetido no arquivo. */
function validarLinhas(linhas: Record<string, unknown>[]) {
  const validas: { linha: number; dados: LinhaValida }[] = [];
  const erros: ErroLinha[] = [];
  const primeiraLinhaDoSku = new Map<string, number>();
  linhas.forEach((crua, i) => {
    const linha = i + 2;
    const r = linhaSchema.safeParse(crua);
    if (!r.success) {
      for (const issue of r.error.issues) erros.push({ linha, campo: String(issue.path[0] ?? "linha"), mensagem: issue.message });
      return;
    }
    const anterior = primeiraLinhaDoSku.get(r.data.sku);
    if (anterior !== undefined) {
      erros.push({ linha, campo: "sku", mensagem: `SKU "${r.data.sku}" repetido no arquivo (já aparece na linha ${anterior})` });
      return;
    }
    primeiraLinhaDoSku.set(r.data.sku, linha);
    validas.push({ linha, dados: r.data });
  });
  return { validas, erros };
}

const lotes = <T,>(xs: T[], n = LOTE) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function importarProdutos(dados: unknown): Promise<ResultadoPreview | ResultadoCommit> {
  const ctx = await obterContexto(); // sem sessão → AppError 401
  if (!ctx.userId) throw new AppError(401, "Não autenticado", "nao_autenticado");
  const entrada = entradaSchema.parse(dados);
  const { supabase } = ctx;

  // a representada precisa ser do usuário (RLS esconde as de outros)
  const { data: rep, error: eRep } = await supabase.from("representadas").select("id").eq("id", entrada.representada_id).maybeSingle<{ id: string }>();
  if (eRep) throw erroBanco(eRep);
  if (!rep) throw new AppError(404, "Representada não encontrada", "nao_encontrado");

  const { validas, erros } = validarLinhas(entrada.linhas);
  const total = entrada.linhas.length;

  if (entrada.modo === "preview") {
    return { modo: "preview", total, validas: validas.length, erros, amostra: validas.slice(0, 20).map((v) => v.dados) };
  }

  // SKUs que já existem nesta representada (para contar inseridos x atualizados e não apagar preço com célula vazia)
  const existentes = new Set<string>();
  for (const lote of lotes(validas.map((v) => v.dados.sku))) {
    const { data, error } = await supabase.from("produtos").select("sku").eq("representada_id", rep.id).in("sku", lote).returns<{ sku: string }[]>();
    if (error) throw erroBanco(error);
    data.forEach((p) => existentes.add(p.sku));
  }

  const base = (d: LinhaValida) => ({
    representada_id: rep.id, sku: d.sku, nome: d.nome, unidade: d.unidade, ncm: d.ncm,
    categoria: d.categoria, comissao: d.comissao, descricao: d.descricao,
  });
  // 3 grupos com as mesmas colunas por chamada: com preço; novos sem preço (preco null); existentes sem preço (preço atual mantido)
  const comPreco = validas.filter((v) => v.dados.preco_padrao != null).map((v) => ({ ...base(v.dados), preco: v.dados.preco_padrao }));
  const novosSemPreco = validas.filter((v) => v.dados.preco_padrao == null && !existentes.has(v.dados.sku)).map((v) => ({ ...base(v.dados), preco: null }));
  const existentesSemPreco = validas.filter((v) => v.dados.preco_padrao == null && existentes.has(v.dados.sku)).map((v) => base(v.dados));

  const idPorSku = new Map<string, string>();
  for (const grupo of [comPreco, novosSemPreco, existentesSemPreco]) {
    for (const lote of lotes<Record<string, unknown>>(grupo)) {
      const { data, error } = await supabase
        .from("produtos")
        .upsert(lote, { onConflict: "representada_id,sku" })
        .select("id, sku")
        .returns<{ id: string; sku: string }[]>();
      if (error) throw erroBanco(error, "SKU em conflito");
      data.forEach((p) => idPorSku.set(p.sku, p.id));
    }
  }

  // tabela de preço padrão (preço + desconto máximo); sem preço na planilha, só o desconto da linha existente muda
  const precoPadrao = validas
    .filter((v) => v.dados.preco_padrao != null && idPorSku.has(v.dados.sku))
    .map((v) => ({ representada_id: rep.id, produto_id: idPorSku.get(v.dados.sku)!, cliente_id: null, preco: v.dados.preco_padrao!, desconto_max: v.dados.desconto_maximo }));
  const semPrecoIds = validas.filter((v) => v.dados.preco_padrao == null && idPorSku.has(v.dados.sku)).map((v) => [idPorSku.get(v.dados.sku)!, v.dados.desconto_maximo] as const);
  for (const lote of lotes(semPrecoIds)) {
    const { data, error } = await supabase
      .from("tabelas_preco")
      .select("produto_id, preco")
      .is("cliente_id", null)
      .in("produto_id", lote.map(([id]) => id))
      .returns<{ produto_id: string; preco: number }[]>();
    if (error) throw erroBanco(error);
    const desconto = new Map(lote);
    data.forEach((t) => precoPadrao.push({ representada_id: rep.id, produto_id: t.produto_id, cliente_id: null, preco: Number(t.preco), desconto_max: desconto.get(t.produto_id) ?? 0 }));
  }
  for (const lote of lotes(precoPadrao)) {
    const { error } = await supabase.from("tabelas_preco").upsert(lote, { onConflict: "produto_id,cliente_id" });
    if (error) throw erroBanco(error);
  }

  const atualizados = validas.filter((v) => existentes.has(v.dados.sku)).length;
  const inseridos = validas.length - atualizados;
  const { error: eLog } = await supabase.from("importacoes").insert({
    user_id: ctx.userId, representada_id: rep.id, tipo: "produtos", arquivo: entrada.arquivo,
    total, validas: validas.length, inseridos, atualizados, com_erro: new Set(erros.map((e) => e.linha)).size,
    erros: erros.slice(0, MAX_ERROS_SALVOS),
  });
  if (eLog) throw erroBanco(eLog);

  revalidatePath(`/app/representadas/${rep.id}/catalogo`);
  return { modo: "commit", total, inseridos, atualizados, erros };
}
