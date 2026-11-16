import type { ConfiguracaoImportacao, ProblemaImportacao, ResultadoValidacaoLinha, ContextoValidacao } from "./tipos";
import { parseData, parseNumero, parsePercentual } from "@/lib/import/valores";
import { chaveImportacao } from "@/lib/importacao/motor";
import { documentoClienteSchema, subtotalItem } from "@/lib/validacao";
import { formatarMoeda } from "@/lib/formato";

/**
 * Importação de PEDIDOS (Fase 17) — mesma base das importações de representadas e clientes. Cada linha da
 * planilha é um ITEM; várias linhas formam um pedido.
 *
 * Decisões confirmadas com o usuário: cliente identificado pelo CNPJ/CPF (cliente não cadastrado = linha
 * inválida); representada DEDUZIDA pelo SKU; produto não encontrado = item gravado com pendência; pedidos sem
 * pendência entram confirmados (comissão lançada), com pendência entram como rascunho.
 */

/** Cabeçalho do modelo — nomes EXATOS, nesta ordem (contrato). Coluna → campo. */
export const COLUNAS_PEDIDO = {
  "Número do Pedido": "numero_pedido",
  "Data do Pedido": "data",
  "CNPJ/CPF do Cliente": "documento",
  "SKU do Produto": "sku",
  "Descrição do Produto": "descricao",
  "Quantidade": "quantidade",
  "Preço Unitário": "preco_unitario",
  "Desconto (%)": "desconto_percentual",
  "Acréscimo (%)": "acrescimo_percentual",
  "Forma de Pagamento": "forma_pagamento",
  "Prazo (dias)": "prazo_dias",
  "Observações": "observacoes",
  /** Fase 20: opcional (modelos antigos sem a coluna continuam importando) */
  "Comissão (R$)": "comissao_valor",
  /** Fase 21: opcional — base da previsão de recebimento e da completude da comissão (sem ela, a comissão vai para análise) */
  "Data de Faturamento": "data_faturamento",
} as const;

/** Fase 21: data de faturamento do pedido (igual em todas as linhas do pedido). */
export const COLUNA_FATURAMENTO = "Data de Faturamento";

/** Fase 20: coluna de comissão do item. > 0 prevalece; vazia, zero ou fórmula sem valor = ausência. */
export const COLUNA_COMISSAO = "Comissão (R$)";
export const MSG_COMISSAO_AUSENTE = "Comissão (R$) não informada ou zerada: será calculada pelo cadastro (percentual) e enviada para análise na página de Comissões.";
export const ROTULOS_PEDIDO = Object.keys(COLUNAS_PEDIDO) as (keyof typeof COLUNAS_PEDIDO)[];
export const OBRIGATORIAS_PEDIDO = ["Data do Pedido", "CNPJ/CPF do Cliente", "SKU do Produto", "Quantidade", "Preço Unitário"];

/** Domínio fechado do banco (pedidos_forma_pagamento_check) → rótulo da lista do modelo. */
export const FORMAS_PAGAMENTO_PLANILHA: Record<string, string> = {
  Dinheiro: "dinheiro", Crédito: "credito", Débito: "debito", Bonificação: "bonificacao", Pix: "pix", Outros: "outros",
};
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const FORMA_POR_NOME = new Map(Object.entries(FORMAS_PAGAMENTO_PLANILHA).flatMap(([r, v]) => [[semAcento(r), v], [v, v]]));

/** Existentes (lidos no servidor com RLS): "cliente:<doc>", "sku:<sku>" (produtos de todas as representadas), "codigo_pedido:<código>". */
export type ClienteExistente = { id: string; nome: string };
export type ProdutoExistente = { produto_id: string; representada_id: string; representada: string; nome: string; preco: number | null };


function validarLinhaPedido(bruto: Record<string, string>, ctx: ContextoValidacao): ResultadoValidacaoLinha {
  const erros: ProblemaImportacao[] = [];
  const alertas: ProblemaImportacao[] = [];
  const dados: Record<string, string | number | null> = {};
  const erro = (coluna: string, mensagem: string) => erros.push({ campo: coluna, mensagem, valor_recebido: bruto[coluna] || null });
  const v = (c: keyof typeof COLUNAS_PEDIDO) => (bruto[c] ?? "").trim();

  if (v("Número do Pedido")) {
    const n = v("Número do Pedido");
    if (n.length > 40) erro("Número do Pedido", "Número do Pedido: máximo de 40 caracteres");
    else if (ctx.valoresExistentesNaBase.has(chaveImportacao("codigo_pedido", n))) erro("Número do Pedido", `Já existe um pedido com o número ${n} (não é sobrescrito)`);
    else dados.numero_pedido = n;
  }
  if (v("Data do Pedido")) {
    const d = parseData(v("Data do Pedido"));
    if (!d) erro("Data do Pedido", "Data do Pedido inválida: use DD/MM/AAAA (ex.: 20/10/2026)");
    else dados.data = d;
  }
  if (v("CNPJ/CPF do Cliente")) {
    const r = documentoClienteSchema.safeParse(v("CNPJ/CPF do Cliente").replace(/^(\d{10})$/, "0$1").replace(/^(\d{12,13})$/, (x) => x.padStart(14, "0")));
    if (!r.success) erro("CNPJ/CPF do Cliente", r.error.issues[0]?.message ?? "CNPJ/CPF inválido");
    else if (!ctx.valoresExistentesNaBase.has(chaveImportacao("cliente", r.data))) {
      erro("CNPJ/CPF do Cliente", "Cliente não cadastrado: cadastre-o antes (página Clientes ou “Cadastrar Clientes com Excel”)");
    } else dados.documento = r.data;
  }
  if (v("SKU do Produto")) {
    if (v("SKU do Produto").length > 60) erro("SKU do Produto", "SKU: máximo de 60 caracteres");
    else dados.sku = v("SKU do Produto");
  }
  if (v("Descrição do Produto")) {
    if (v("Descrição do Produto").length > 200) erro("Descrição do Produto", "Descrição do Produto: máximo de 200 caracteres");
    else dados.descricao = v("Descrição do Produto");
  }
  if (v("Quantidade")) {
    const q = parseNumero(v("Quantidade"));
    if (q == null || q < 1 || q > 1_000_000) erro("Quantidade", "Quantidade deve ser um número maior ou igual a 1");
    else dados.quantidade = q;
  }
  if (v("Preço Unitário")) {
    const p = parseNumero(v("Preço Unitário"));
    if (p == null || p < 0 || p > 99_999_999) erro("Preço Unitário", "Preço Unitário deve ser um número maior ou igual a 0");
    else dados.preco_unitario = Math.round(p * 100) / 100;
  }
  if (v("Desconto (%)")) {
    const d = parsePercentual(v("Desconto (%)"));
    if (d == null || d < 0 || d > 100) erro("Desconto (%)", "Desconto deve estar entre 0 e 100");
    else dados.desconto_percentual = Math.round(d * 100) / 100;
  }
  if (v("Acréscimo (%)")) {
    const a = parsePercentual(v("Acréscimo (%)"));
    if (a == null || a < 0 || a > 100) erro("Acréscimo (%)", "Acréscimo deve estar entre 0 e 100");
    else dados.acrescimo_percentual = Math.round(a * 100) / 100;
  }
  if (v("Forma de Pagamento")) {
    const f = FORMA_POR_NOME.get(semAcento(v("Forma de Pagamento")));
    if (!f) erro("Forma de Pagamento", `Forma de Pagamento inválida: use ${Object.keys(FORMAS_PAGAMENTO_PLANILHA).join(", ")}`);
    else dados.forma_pagamento = f;
  }
  if (v("Prazo (dias)")) {
    const p = parseNumero(v("Prazo (dias)"));
    if (p == null || !Number.isInteger(p) || p < 1 || p > 365) erro("Prazo (dias)", "Prazo deve ser um número inteiro de dias, de 1 a 365 (vazio = à vista)");
    else dados.prazo_dias = p;
  }
  if (v("Observações")) {
    if (v("Observações").length > 500) erro("Observações", "Observações: máximo de 500 caracteres");
    else dados.observacoes = v("Observações");
  }
  if (v(COLUNA_FATURAMENTO)) {
    const d = parseData(v(COLUNA_FATURAMENTO));
    if (!d) erro(COLUNA_FATURAMENTO, "Data de Faturamento inválida: use DD/MM/AAAA (ex.: 25/10/2026)");
    else dados.data_faturamento = d;
  }
  // Fase 20 (D/E): zero e vazio são a MESMA coisa (ausência); a linha é importada com alerta, a comissão é
  // calculada pelo cadastro e fica pendente de análise. Coluna ausente (modelo antigo) = comportamento anterior.
  if (!ctx.colunasAusentes?.includes(COLUNA_COMISSAO)) {
    const linha = ctx.numeroLinha ?? "?";
    const formula = ctx.formulas?.[COLUNA_COMISSAO];
    const c = v(COLUNA_COMISSAO);
    const n = c ? parseNumero(c) : null;
    const ausente = (mensagem: string) => {
      dados.comissao_ausente = 1;
      alertas.push({ campo: COLUNA_COMISSAO, mensagem, valor_recebido: c || null });
    };
    if (formula === "sem_valor") {
      ausente(`Linha ${linha}, campo Comissão (R$): a célula contém fórmula sem valor calculado. Abra e salve o arquivo no Excel e reenvie, ou preencha o valor manualmente. A comissão será calculada pelo cadastro e enviada para análise.`);
    } else if (formula === "zero") {
      ausente(`Linha ${linha}, campo Comissão (R$): a fórmula retornou zero; o zero não é aceito. A comissão foi calculada pelo cadastro e enviada para análise na página de Comissões.`);
    } else if (c && (n == null || n < 0 || n > 99_999_999)) {
      erro(COLUNA_COMISSAO, "Comissão (R$) deve ser um número maior que 0 (vazio ou zero = calculada pelo cadastro)");
    } else if (n != null && n > 0) {
      dados.comissao_valor = Math.round(n * 100) / 100;
    } else {
      ausente(MSG_COMISSAO_AUSENTE);
    }
  }
  return { numero_linha: 0, classificacao: "valida", dados, erros, alertas };
}

/** Pedido montado a partir das linhas (o que vai para a gravação). */
export type GrupoPedido = {
  codigo: string | null;
  data: string;
  cliente_id: string;
  cliente: string;
  representada_id: string;
  representada: string;
  forma_pagamento: string | null;
  prazo_dias: number | null;
  observacoes: string | null;
  /** Fase 21: data de faturamento (AAAA-MM-DD) ou null */
  data_faturamento: string | null;
  linhas: number[];
  itens: {
    produto_id: string | null; sku: string; descricao: string | null; quantidade: number; preco_unitario: number;
    desconto_percentual: number; acrescimo_percentual: number; pendencia: "produto_nao_cadastrado" | null;
    /** Fase 17.1: linha da planilha (registrada na pendência do item sem produto) */
    linha: number;
    /** Fase 20: valor da planilha (> 0, prevalece) ou null; comissao_ausente = célula vazia/zerada (vai para análise) */
    comissao_valor: number | null; comissao_ausente: boolean;
  }[];
};

/**
 * AGRUPAMENTO (cada linha é um item):
 *  - Número do Pedido preenchido → todas as linhas com esse número formam UM pedido (precisam ter a mesma data e
 *    o mesmo cliente).
 *  - Número vazio → linhas CONSECUTIVAS com a mesma data e o mesmo CNPJ/CPF formam um pedido automático; mudou a
 *    data, o cliente ou apareceu uma linha numerada, começa outro pedido. O número é gerado no servidor.
 *  - Representada: a ÚNICA representada que tem todos os SKUs encontrados do pedido. Nenhum SKU no Catálogo,
 *    itens de representadas diferentes ou SKU que existe em mais de uma representada sem desempate → pedido
 *    inválido (o banco exige a representada).
 *  - Produto não encontrado na representada → item gravado sem vínculo, com a descrição da planilha e pendência.
 *  - PREÇO: o gravado é SEMPRE o da planilha, mesmo diferente do Catálogo; acima de 10% de diferença vira só uma
 *    pendência informativa (não bloqueia).
 *  - Uma linha com erro invalida o pedido inteiro (nunca grava pedido pela metade).
 * Acrescenta erros/alertas às linhas e devolve os pedidos válidos.
 */
export function agruparPedidos(linhas: ResultadoValidacaoLinha[], existentes: Map<string, unknown>): GrupoPedido[] {
  const grupos: ResultadoValidacaoLinha[][] = [];
  const porNumero = new Map<string, ResultadoValidacaoLinha[]>();
  let corrente: { chave: string; linhas: ResultadoValidacaoLinha[] } | null = null;
  for (const l of [...linhas].sort((a, b) => a.numero_linha - b.numero_linha)) {
    const numero = l.dados.numero_pedido as string | undefined;
    if (numero) {
      corrente = null;
      const g = porNumero.get(numero) ?? [];
      if (!g.length) { porNumero.set(numero, g); grupos.push(g); }
      g.push(l);
      continue;
    }
    const chave = `${l.dados.data ?? `?${l.numero_linha}`}|${l.dados.documento ?? `?${l.numero_linha}`}`;
    if (corrente && corrente.chave === chave) corrente.linhas.push(l);
    else { corrente = { chave, linhas: [l] }; grupos.push(corrente.linhas); }
  }

  const prontos: GrupoPedido[] = [];
  for (const g of grupos) {
    const rotulo = (g[0]!.dados.numero_pedido as string | undefined) ? `Pedido ${g[0]!.dados.numero_pedido}` : `Pedido automático (linha ${g[0]!.numero_linha})`;
    const invalidar = (mensagem: string) => g.forEach((l) => l.erros.push({ campo: "Pedido", mensagem: `${rotulo}: ${mensagem}`, valor_recebido: null }));

    const comErro = g.find((l) => l.erros.length);
    if (comErro) {
      g.filter((l) => !l.erros.length).forEach((l) => l.erros.push({ campo: "Pedido", mensagem: `${rotulo} ignorado: a linha ${comErro.numero_linha} deste pedido tem erro`, valor_recebido: null }));
      continue;
    }
    const base = g[0]!.dados;
    if (g.some((l) => l.dados.data !== base.data || l.dados.documento !== base.documento)) {
      invalidar("as linhas deste número têm datas ou clientes diferentes");
      continue;
    }
    const faturamentos = [...new Set(g.map((l) => l.dados.data_faturamento).filter(Boolean))];
    if (faturamentos.length > 1) { invalidar("as linhas deste número têm datas de faturamento diferentes"); continue; }

    // representada = interseção das representadas de cada SKU encontrado
    const candidatos = g.map((l) => (existentes.get(chaveImportacao("sku", l.dados.sku)) as ProdutoExistente[] | undefined) ?? []);
    const comProduto = candidatos.filter((c) => c.length);
    if (!comProduto.length) { invalidar("nenhum SKU está no Catálogo, então não dá para saber a representada. Cadastre ao menos um dos produtos"); continue; }
    let reps = new Set(comProduto[0]!.map((p) => p.representada_id));
    for (const c of comProduto.slice(1)) reps = new Set(c.map((p) => p.representada_id).filter((r) => reps.has(r)));
    const nomes = [...new Set(comProduto.flat().map((p) => p.representada))].join(", ");
    if (reps.size === 0) { invalidar(`itens de representadas diferentes no mesmo pedido (${nomes})`); continue; }
    if (reps.size > 1) { invalidar(`os SKUs existem em mais de uma representada (${nomes}); não dá para saber a representada`); continue; }
    const repId = [...reps][0]!;
    const repNome = comProduto[0]!.find((p) => p.representada_id === repId)!.representada;
    const cliente = existentes.get(chaveImportacao("cliente", base.documento)) as ClienteExistente;

    const itens: GrupoPedido["itens"] = g.map((l, i) => {
      const produto = candidatos[i]!.find((p) => p.representada_id === repId);
      const preco = Number(l.dados.preco_unitario);
      let pendencia: GrupoPedido["itens"][number]["pendencia"] = null;
      if (!produto) {
        pendencia = "produto_nao_cadastrado";
        l.alertas.push({ campo: "SKU do Produto", mensagem: `Produto não cadastrado no Catálogo de ${repNome}: item gravado com pendência`, valor_recebido: String(l.dados.sku) });
      }
      // Fase 19: pedido importado não passa pela verificação de preço/desconto (vale o preço da planilha, sem pendência)
      return {
        produto_id: produto?.produto_id ?? null, sku: String(l.dados.sku), descricao: (l.dados.descricao as string | undefined) ?? produto?.nome ?? null,
        quantidade: Number(l.dados.quantidade), preco_unitario: preco, desconto_percentual: Number(l.dados.desconto_percentual ?? 0),
        acrescimo_percentual: Number(l.dados.acrescimo_percentual ?? 0), pendencia, linha: l.numero_linha,
        comissao_valor: l.dados.comissao_valor == null ? null : Number(l.dados.comissao_valor), comissao_ausente: l.dados.comissao_ausente === 1,
      };
    });
    prontos.push({
      codigo: (base.numero_pedido as string | undefined) ?? null, data: String(base.data), cliente_id: cliente.id, cliente: cliente.nome,
      representada_id: repId, representada: repNome, forma_pagamento: (base.forma_pagamento as string | undefined) ?? null,
      prazo_dias: (base.prazo_dias as number | undefined) ?? null, observacoes: (base.observacoes as string | undefined) ?? null,
      data_faturamento: (faturamentos[0] as string | undefined) ?? null,
      linhas: g.map((l) => l.numero_linha), itens,
    });
  }
  return prontos;
}

/** Prévia: de onde vem a comissão do pedido (nunca somada ao total). */
const comissaoGrupo = (g: GrupoPedido) => {
  const ausentes = g.itens.filter((i) => i.comissao_ausente).length;
  if (ausentes) return `${ausentes} item(ns) pelo cadastro — análise`;
  const planilha = g.itens.filter((i) => i.comissao_valor != null);
  return planilha.length ? `${formatarMoeda(planilha.reduce((t, i) => t + (i.comissao_valor ?? 0), 0))} da planilha${planilha.length < g.itens.length ? " + cadastro" : ""}` : "Pelo cadastro";
};
const totalGrupo = (g: GrupoPedido) => g.itens.reduce((t, i) => t + subtotalItem(i.quantidade, i.preco_unitario, i.desconto_percentual, i.acrescimo_percentual), 0);
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

export const importacaoPedidos: ConfiguracaoImportacao<{ numero_pedido: string }> = {
  entidade: "pedidos",
  colunasEsperadas: [...ROTULOS_PEDIDO],
  colunasObrigatorias: OBRIGATORIAS_PEDIDO,
  colunasOpcionais: [COLUNA_COMISSAO, COLUNA_FATURAMENTO],
  resumoExtra: (linhas) => [{
    rotulo: "Comissão não informada ou zerada",
    valor: linhas.filter((l) => l.classificacao !== "invalida" && l.dados.comissao_ausente === 1).length,
  }],
  chaveDedupe: "numero_pedido",
  maxLinhas: 5000,
  validarLinha: validarLinhaPedido,
  agrupar: (linhas, existentes) => { agruparPedidos(linhas, existentes); },
  previa: (linhas, existentes) => {
    // recalcula sobre cópias para não duplicar alertas nas linhas da conferência
    const copia = linhas.filter((l) => l.classificacao !== "invalida").map((l) => ({ ...l, erros: [], alertas: [] }));
    return {
      colunas: ["Pedido", "Data", "Cliente", "Representada", "Itens", "Total", "Comissão", "Pendências"],
      linhas: agruparPedidos(copia, existentes).map((g) => [
        g.codigo ?? "Automático (P…)", dataBR(g.data), g.cliente, g.representada, g.itens.length, formatarMoeda(totalGrupo(g)), comissaoGrupo(g),
        g.itens.some((i) => i.pendencia === "produto_nao_cadastrado") ? "Produto não cadastrado" : "—",
      ]),
    };
  },
  modeloUrl: "/templates/modelo-cadastro-pedidos.xlsx",
  mensagens: {
    titulo: "Cadastrar pedidos com Excel",
    singular: "pedido",
    plural: "pedidos",
    obrigatorio: 'Campo obrigatório "{campo}" está vazio',
    chave: "Número do Pedido",
    notaModelo:
      "Cada linha é um ITEM. Linhas com o mesmo Número do Pedido formam um pedido; com o número vazio, linhas seguidas do " +
      "mesmo cliente e da mesma data viram um pedido com número automático. O cliente precisa estar cadastrado (CNPJ/CPF); a " +
      "representada é identificada pelo SKU. Produto não encontrado no Catálogo não impede a gravação: vira pendência. " +
      "Se a coluna de comissão tiver fórmula, salve a planilha no Excel antes de enviar. Células de comissão vazias ou com valor zero serão calculadas pelo cadastro e enviadas para análise na página de Comissões. " +
      "Data de Faturamento (opcional) é a base da previsão de recebimento: sem ela, a comissão fica em análise.",
    avisoComAlertas: "Os pedidos foram carregados com algumas falhas. Acesse a página dos pedidos e faça as alterações manualmente",
    botaoAviso: "Ir para os Pedidos",
  },
  mensagemModelo:
    "Use somente o modelo fornecido, sem mudar o cabeçalho. Obrigatórios: Data do Pedido, CNPJ/CPF do Cliente, SKU do Produto, " +
    "Quantidade e Preço Unitário. O Número do Pedido pode ficar vazio (é gerado automaticamente). O preço gravado é sempre o da planilha.",
  linhaExemplo: {
    "Número do Pedido": "1001", "Data do Pedido": "20/10/2026", "CNPJ/CPF do Cliente": "11.222.333/0001-81", "SKU do Produto": "SKU-001",
    "Descrição do Produto": "Produto de exemplo", "Quantidade": "10", "Preço Unitário": "25,90", "Desconto (%)": "0", "Acréscimo (%)": "0",
    "Forma de Pagamento": "Pix", "Prazo (dias)": "30", "Observações": "Linha de exemplo: apague antes de importar",
  },
};
