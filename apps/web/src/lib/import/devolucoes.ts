import type { ConfiguracaoImportacao, ContextoValidacao, ProblemaImportacao, ResultadoValidacaoLinha } from "@/lib/cadastros/tipos";
import { statusNoGrupo } from "@/lib/comissoes/status";
import { formatarMoeda } from "@/lib/formato";
import { parseData, parseNumero } from "@/lib/import/valores";
import { chaveImportacao } from "@/lib/importacao/motor";

/**
 * Fase 22 — importação de DEVOLUÇÕES por planilha (motor genérico das Fases 15–17). Cada linha = uma devolução de um
 * item do pedido original e gera UMA comissão negativa (estorno) — a comissão original nunca é alterada.
 * Decisões: estorno nasce 'prevista' e só o processamento subtrai (A.1); mês = Data de Processamento (A.2);
 * percentual = o já gravado no item original (A.3); pedido não encontrado = linha inválida (A.4).
 */

export const COLUNAS_DEVOLUCAO = {
  "Código do Pedido": "codigo",
  "SKU": "sku",
  "Descrição": "descricao",
  "Quantidade Devolvida": "quantidade",
  "Valor Unitário": "valor_unitario",
  "Valor Total": "valor_total",
  "Comissão a Estornar (R$)": "comissao_estornada",
  "Data da Devolução": "data_devolucao",
  "Data de Processamento": "data_processamento",
  "Motivo": "motivo",
  "Observações": "observacoes",
} as const;
export const ROTULOS_DEVOLUCAO = Object.keys(COLUNAS_DEVOLUCAO) as (keyof typeof COLUNAS_DEVOLUCAO)[];
export const OBRIGATORIAS_DEVOLUCAO = ["Código do Pedido", "SKU", "Quantidade Devolvida", "Data da Devolução"];
export const COLUNA_COMISSAO_ESTORNO = "Comissão a Estornar (R$)";

export const MOTIVOS_DEVOLUCAO: Record<string, string> = { Defeito: "defeito", Desistência: "desistencia", "Erro no pedido": "erro_pedido", Outro: "outro" };
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const MOTIVO_POR_NOME = new Map(Object.entries(MOTIVOS_DEVOLUCAO).flatMap(([r, v]) => [[semAcento(r), v], [v, v], [semAcento(v), v]]));

/** Item do pedido original (existentes: "pedido:<código normalizado>"). */
export type ItemOriginal = {
  id: string; sku: string | null; descricao: string | null; quantidade: number; subtotal: number;
  comissao_percentual: number; comissao_valor: number; comissao_origem: "calculada" | "planilha"; origem_calculo: string | null;
};
export type PedidoOriginal = { id: string; codigo: string; status_comissao: string | null; itens: ItemOriginal[] };
/** Já devolvido por item (existentes: "item:<id>") e devoluções importadas (existentes: "chave_unica:<chave>"). */
export type DevolvidoItem = { quantidade: number; estornado: number };
export type DevolucaoExistente = { comissao_estornada: number; numero: string };

const cent = (v: number) => Math.round(v * 100) / 100;

/** C.1 — chave única: código | sku | data | quantidade | valor total, normalizada (trim, minúsculas, sem acento). */
export function chaveUnicaDevolucao(codigo: string, sku: string, data: string, quantidade: number, valorTotal: number): string {
  return [codigo, sku, data, String(Number(quantidade)), cent(valorTotal).toFixed(2)].map((p) => semAcento(String(p)).replace(/\s+/g, " ")).join("|");
}
export const chavePedido = (codigo: string) => chaveImportacao("pedido", semAcento(codigo));

/** A.3 — percentual efetivo do item original (valor da planilha: valor ÷ subtotal). */
export function percentualDoItem(i: ItemOriginal): number {
  if (i.comissao_origem === "planilha" && i.subtotal > 0) return Math.round((i.comissao_valor / i.subtotal) * 1_000_000) / 10_000;
  return Number(i.comissao_percentual);
}

function validarLinhaDevolucao(bruto: Record<string, string>, ctx: ContextoValidacao): ResultadoValidacaoLinha {
  const erros: ProblemaImportacao[] = [];
  const alertas: ProblemaImportacao[] = [];
  const dados: Record<string, string | number | null> = {};
  const v = (c: keyof typeof COLUNAS_DEVOLUCAO) => (bruto[c] ?? "").trim();
  const erro = (coluna: string, mensagem: string) => erros.push({ campo: coluna, mensagem, valor_recebido: bruto[coluna] || null });
  const linha = ctx.numeroLinha ?? "?";
  const num = (c: keyof typeof COLUNAS_DEVOLUCAO, nome: string, minimo: number) => {
    if (!v(c)) return null;
    const n = parseNumero(v(c));
    if (n == null || n < minimo || n > 99_999_999) { erro(c, `Linha ${linha}, campo ${nome}: número inválido`); return null; }
    return n;
  };

  const codigo = v("Código do Pedido");
  const sku = v("SKU");
  if (codigo.length > 40) erro("Código do Pedido", "Código do Pedido: máximo de 40 caracteres");
  if (sku.length > 60) erro("SKU", "SKU: máximo de 60 caracteres");
  if (v("Descrição").length > 200) erro("Descrição", "Descrição: máximo de 200 caracteres");
  if (v("Observações").length > 500) erro("Observações", "Observações: máximo de 500 caracteres");
  const quantidade = num("Quantidade Devolvida", "Quantidade Devolvida", 0.001);
  const unitario = num("Valor Unitário", "Valor Unitário", 0);
  const totalInformado = num("Valor Total", "Valor Total", 0.01);
  const dataDev = v("Data da Devolução") ? parseData(v("Data da Devolução")) : null;
  if (v("Data da Devolução") && !dataDev) erro("Data da Devolução", `Linha ${linha}, campo Data da Devolução: data inválida (use DD/MM/AAAA)`);
  const dataProc = v("Data de Processamento") ? parseData(v("Data de Processamento")) : null;
  if (v("Data de Processamento") && !dataProc) erro("Data de Processamento", `Linha ${linha}, campo Data de Processamento: data inválida (use DD/MM/AAAA)`);
  let motivo: string | null = null;
  if (v("Motivo")) {
    motivo = MOTIVO_POR_NOME.get(semAcento(v("Motivo"))) ?? null;
    if (!motivo) erro("Motivo", `Motivo inválido: use ${Object.keys(MOTIVOS_DEVOLUCAO).join(", ")}`);
  }

  // A.4: pedido original obrigatório (casa com pedidos.codigo_pedido)
  const pedido = codigo ? (ctx.valoresExistentesNaBase.get(chavePedido(codigo)) as PedidoOriginal | undefined) : undefined;
  if (codigo && !pedido) erro("Código do Pedido", `Linha ${linha}: pedido ${codigo} não encontrado`);
  const item = pedido && sku
    ? pedido.itens.find((i) => (i.sku ?? "").toLowerCase() === sku.toLowerCase())
    : undefined;
  if (pedido && sku && !item) erro("SKU", `Linha ${linha}: o SKU ${sku} não está no pedido ${pedido.codigo}`);

  // D.2: Valor Total vazio → qtd × unitário; ambos vazios → unitário do item original (subtotal ÷ quantidade)
  let unit = unitario;
  let total = totalInformado;
  if (total == null && unit == null && item && quantidade) unit = cent(item.subtotal / item.quantidade);
  if (total == null && unit != null && quantidade) total = cent(quantidade * unit);
  if (total == null && quantidade && !erros.length) erro("Valor Total", `Linha ${linha}: informe o Valor Total ou o Valor Unitário`);

  // D.3/D.4: comissão a estornar — > 0 vale; vazia, zero ou fórmula sem valor → percentual do item original
  const formula = ctx.formulas?.[COLUNA_COMISSAO_ESTORNO];
  const cTexto = v("Comissão a Estornar (R$)");
  const cInformada = cTexto ? parseNumero(cTexto) : null;
  if (cTexto && (cInformada == null || cInformada < 0)) erro(COLUNA_COMISSAO_ESTORNO, `Linha ${linha}, campo ${COLUNA_COMISSAO_ESTORNO}: número inválido`);
  let comissao: number | null = cInformada != null && cInformada > 0 ? cent(cInformada) : null;
  const pct = item ? percentualDoItem(item) : null;
  if (comissao == null && item && total != null) {
    comissao = cent(total * (pct ?? 0) / 100);
    if (formula === "sem_valor") alertas.push({ campo: COLUNA_COMISSAO_ESTORNO, mensagem: `Linha ${linha}, campo ${COLUNA_COMISSAO_ESTORNO}: a célula contém fórmula sem valor calculado; foi usado o valor calculado pelo percentual do pedido original (${formatarMoeda(comissao)}). Salve o arquivo no Excel e reenvie se quiser o valor da planilha.`, valor_recebido: null });
    else if (formula === "zero") alertas.push({ campo: COLUNA_COMISSAO_ESTORNO, mensagem: `Linha ${linha}, campo ${COLUNA_COMISSAO_ESTORNO}: a fórmula retornou zero (não aceito); foi usado o percentual do pedido original (${formatarMoeda(comissao)}).`, valor_recebido: null });
  }
  for (const [c, f] of Object.entries(ctx.formulas ?? {})) {
    if (c !== COLUNA_COMISSAO_ESTORNO && f === "sem_valor") alertas.push({ campo: c, mensagem: `Linha ${linha}, campo ${c}: a célula contém fórmula sem valor calculado. Salve o arquivo no Excel e reenvie.`, valor_recebido: null });
  }

  if (!erros.length && pedido && item && quantidade && total != null && dataDev && comissao != null) {
    const chave = chaveUnicaDevolucao(codigo, sku, dataDev, quantidade, total);
    if (ctx.linhasAnteriores.includes(chaveImportacao("chave_unica", chave))) {
      erro("Código do Pedido", `Linha ${linha}: devolução duplicada no próprio arquivo (mesmo pedido, SKU, data, quantidade e valor)`);
    }
    const existente = ctx.valoresExistentesNaBase.get(chaveImportacao("chave_unica", chave)) as DevolucaoExistente | undefined;
    // C.3: mesma chave com comissão diferente = conflito (nunca sobrescreve)
    if (existente && cInformada != null && cInformada > 0 && cent(existente.comissao_estornada) !== cent(cInformada)) {
      erro(COLUNA_COMISSAO_ESTORNO, `Linha ${linha}: conflito com a devolução ${existente.numero} já importada — comissão estornada ${formatarMoeda(existente.comissao_estornada)} (antiga) × ${formatarMoeda(cInformada)} (nova). Nada foi sobrescrito: exclua a devolução antiga ou ajuste a planilha.`);
    }
    Object.assign(dados, {
      chave_unica: chave, codigo, sku, descricao: v("Descrição") || null, pedido_item_id: item.id, quantidade, valor_unitario: unit, valor_total: total,
      comissao_estornada: comissao, percentual: pct, origem_calculo: item.origem_calculo, data_devolucao: dataDev, data_processamento: dataProc,
      motivo, observacoes: v("Observações") || null, duplicada: existente ? 1 : 0, linha: ctx.numeroLinha ?? null,
    });
    // F.4: comissão original ainda não recebida → permitido, com observação no estorno
    const grupo = statusNoGrupo(pedido.status_comissao);
    if (grupo === "a_receber" || grupo === "em_analise") {
      dados.observacao_estorno = "Estorno de comissão ainda não recebida: pode cair em mês anterior ao do recebimento.";
      dados.original_nao_recebida = 1;
    }
  } else {
    Object.assign(dados, { codigo, sku, chave_unica: null });
  }
  return { numero_linha: ctx.numeroLinha ?? 0, classificacao: erros.length ? "invalida" : alertas.length ? "com_alerta" : "valida", dados, erros, alertas };
}

/**
 * F.1/F.2 — proteções por ITEM, somando o já gravado e as linhas anteriores do arquivo: quantidade acima da vendida
 * invalida a linha; estorno acima do saldo da comissão do item é LIMITADO ao saldo (com alerta). Nunca bloqueia o
 * arquivo inteiro: cada linha com problema é isolada.
 */
export function protegerDevolucoes(linhas: ResultadoValidacaoLinha[], existentes: Map<string, unknown>): void {
  const acumulado = new Map<string, DevolvidoItem>();
  const itens = new Map<string, ItemOriginal>();
  for (const v of existentes.values()) {
    const p = v as PedidoOriginal;
    if (p && Array.isArray(p.itens)) for (const i of p.itens) itens.set(i.id, i);
  }
  for (const l of [...linhas].sort((a, b) => a.numero_linha - b.numero_linha)) {
    if (l.erros.length || !l.dados.pedido_item_id || l.dados.duplicada === 1) continue;
    const id = String(l.dados.pedido_item_id);
    const item = itens.get(id);
    if (!item) continue;
    const base = acumulado.get(id) ?? { ...((existentes.get(chaveImportacao("item", id)) as DevolvidoItem | undefined) ?? { quantidade: 0, estornado: 0 }) };
    const qtd = Number(l.dados.quantidade);
    if (base.quantidade + qtd > item.quantidade + 1e-9) {
      l.erros.push({ campo: "Quantidade Devolvida", mensagem: `Quantidade devolvida (${fmtQtd(base.quantidade + qtd)}) excede a vendida (${fmtQtd(item.quantidade)}) para este item.`, valor_recebido: String(qtd) });
      continue;
    }
    const saldo = cent(Math.max(item.comissao_valor - base.estornado, 0));
    if (Number(l.dados.comissao_estornada) > saldo) {
      l.alertas.push({
        campo: COLUNA_COMISSAO_ESTORNO,
        mensagem: `Comissão a estornar (${formatarMoeda(Number(l.dados.comissao_estornada))}) acima do saldo do item: limitada a ${formatarMoeda(saldo)} (comissão original ${formatarMoeda(item.comissao_valor)}, já estornado ${formatarMoeda(base.estornado)}).`,
        valor_recebido: String(l.dados.comissao_estornada),
      });
      l.dados.comissao_estornada = saldo;
    }
    acumulado.set(id, { quantidade: base.quantidade + qtd, estornado: cent(base.estornado + Number(l.dados.comissao_estornada)) });
  }
}
const fmtQtd = (n: number) => Number(n.toFixed(3)).toLocaleString("pt-BR");
const dataBR = (iso: unknown) => (typeof iso === "string" && iso ? iso.split("-").reverse().join("/") : "—");
const gravaveis = (linhas: ResultadoValidacaoLinha[]) => linhas.filter((l) => l.classificacao !== "invalida" && l.dados.duplicada !== 1);

export const importacaoDevolucoes: ConfiguracaoImportacao<{ chave_unica: string }> = {
  entidade: "devolucoes",
  colunasEsperadas: [...ROTULOS_DEVOLUCAO],
  colunasObrigatorias: OBRIGATORIAS_DEVOLUCAO,
  chaveDedupe: "chave_unica",
  maxLinhas: 5000,
  validarLinha: validarLinhaDevolucao,
  agrupar: (linhas, existentes) => protegerDevolucoes(linhas, existentes),
  // C.2: mesma chave já importada = 'duplicada' (ignorada; nada é gravado de novo)
  semAlteracao: (dados) => dados.duplicada === 1,
  resumoExtra: (linhas) => [
    { rotulo: "Duplicadas (já importadas)", valor: linhas.filter((l) => l.classificacao !== "invalida" && l.dados.duplicada === 1).length },
    { rotulo: "Valor total a estornar", valor: cent(gravaveis(linhas).reduce((t, l) => t + Number(l.dados.comissao_estornada ?? 0), 0)), formato: "moeda" },
    { rotulo: "Estornos de comissão ainda não recebida", valor: gravaveis(linhas).filter((l) => l.dados.original_nao_recebida === 1).length },
  ],
  previa: (linhas) => ({
    colunas: ["Linha", "Pedido", "SKU", "Qtd.", "Valor total", "Comissão a estornar", "Devolução", "Processamento"],
    linhas: gravaveis(linhas).map((l) => [
      l.numero_linha, String(l.dados.codigo), String(l.dados.sku), fmtQtd(Number(l.dados.quantidade)), formatarMoeda(Number(l.dados.valor_total)),
      `−${formatarMoeda(Number(l.dados.comissao_estornada))}`, dataBR(l.dados.data_devolucao), l.dados.data_processamento ? dataBR(l.dados.data_processamento) : "Pendente",
    ]),
  }),
  modeloUrl: "/templates/modelo-devolucoes.xlsx",
  mensagens: {
    titulo: "Cadastrar devoluções com Excel",
    singular: "devolução",
    plural: "devoluções",
    obrigatorio: 'Campo obrigatório "{campo}" está vazio',
    chave: "Código do Pedido",
    notaModelo:
      "Cada linha é a devolução de UM item de um pedido já lançado (Código do Pedido + SKU). A comissão a estornar vazia ou zerada é " +
      "calculada pelo percentual gravado no item do pedido original. Cada devolução gera uma comissão NEGATIVA (estorno) que só reduz o " +
      "recebido quando a devolução é processada. Reenviar a mesma planilha não duplica nada. Planilhas com fórmula: salve no Excel antes de enviar.",
    avisoComAlertas: "As devoluções foram carregadas com alguns avisos. Confira na página de Comissões › Devoluções.",
    botaoAviso: "Ir para as Devoluções",
  },
  mensagemModelo:
    "Use somente o modelo fornecido, sem mudar o cabeçalho. Obrigatórios: Código do Pedido, SKU, Quantidade Devolvida e Data da Devolução.",
  linhaExemplo: {
    "Código do Pedido": "P000012", "SKU": "SKU-001", "Descrição": "Produto de exemplo", "Quantidade Devolvida": "2", "Valor Unitário": "25,90",
    "Valor Total": "51,80", "Comissão a Estornar (R$)": "", "Data da Devolução": "05/11/2026", "Data de Processamento": "", "Motivo": "Defeito",
    "Observações": "Linha de exemplo: apague antes de importar",
  },
};
