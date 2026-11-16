import { statusNoGrupo, type MotivoPendencia, type OrigemCalculo } from "./status";

/**
 * Fase 21 — regras puras de comissão (D, E, F). Espelho das funções SQL resolver_comissao_pct/origem_comissao,
 * calcular_previsao_recebimento e verificar_completude_comissao (o banco grava; aqui a tela e os testes calculam igual).
 */

const definido = (v: number | null | undefined): v is number => v != null && Number(v) > 0;

/**
 * D — precedência do PERCENTUAL ("definido" = > 0):
 *  D.1 representada com comissão fixa → a da REPRESENTADA (origem 'representada').
 *  D.2 representada sem comissão fixa → a do CATÁLOGO do produto (origem 'catalogo'), SEM alerta (decisão A.2).
 *  D.3 nenhum → 0 (origem 'zero'): comissão incompleta, motivo 'comissao_nao_definida'.
 *  D.4 item SEM produto (17.1): não usa catálogo — planilha > 0, depois representada, só então 0.
 *  D.5 comissão editada manualmente: origem 'manual', prevalece sobre recálculos (não passa por aqui).
 *  D.6 valor da planilha > 0 prevalece e conta como DEFINIDO; zero não conta (Fase 20).
 */
export function resolverPercentualComissao(
  produto: { comissao: number | null | undefined } | null | undefined,
  representada: { comissao_percentual: number | null | undefined },
): { percentual: number; origem_calculo: Exclude<OrigemCalculo, "manual"> } {
  if (definido(representada.comissao_percentual)) return { percentual: Number(representada.comissao_percentual), origem_calculo: "representada" };
  if (produto && definido(produto.comissao)) return { percentual: Number(produto.comissao), origem_calculo: "catalogo" };
  return { percentual: 0, origem_calculo: "zero" };
}

export type TipoPagamentoComissao = "faturamento" | "pagamento" | "outro";
export type PedidoPrevisao = { data_faturamento: string | null; data: string | null; prazo_tipo: string | null; prazo_dias: number | null };
export type RepresentadaPrevisao = {
  comissao_pagamento_tipo: TipoPagamentoComissao | null; comissao_pagamento_referencia: "faturamento" | "pagamento" | null; comissao_pagamento_dias: number | null;
};

const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * E — data prevista de recebimento. Base = data de faturamento.
 *  E.1 'faturamento' → faturamento · E.2 'pagamento' → faturamento + prazo do cliente (à vista = 0)
 *  E.3 'outro'+'faturamento' → faturamento + dias · E.4 'outro'+'pagamento' → faturamento + prazo do cliente + dias
 *  E.5 faltou insumo → ESTIMATIVA (sem faturamento usa a data do pedido; prazo/dias ausentes = 0). Nunca liquida.
 *  E.6 sem faturamento e sem data do pedido → null ("Sem previsão").
 */
export function calcularPrevisaoRecebimento(pedido: PedidoPrevisao, representada: RepresentadaPrevisao): { previsao: string | null; estimativa: boolean } {
  const base = pedido.data_faturamento ?? (pedido.data ? pedido.data.slice(0, 10) : null);
  if (!base) return { previsao: null, estimativa: true };
  let estimativa = !pedido.data_faturamento;
  const cliente = (pedido.prazo_tipo ?? "a_vista") === "a_vista" ? 0 : pedido.prazo_dias;
  const prazoCliente = () => { if (cliente == null) estimativa = true; return cliente ?? 0; };
  const r = representada;
  let dias: number;
  if (!r.comissao_pagamento_tipo) { estimativa = true; dias = 0; }
  else if (r.comissao_pagamento_tipo === "faturamento") dias = 0;
  else if (r.comissao_pagamento_tipo === "pagamento") dias = prazoCliente();
  else {
    if (r.comissao_pagamento_dias == null || !r.comissao_pagamento_referencia) estimativa = true;
    dias = (r.comissao_pagamento_referencia === "pagamento" ? prazoCliente() : 0) + (r.comissao_pagamento_dias ?? 0);
  }
  return { previsao: somarDias(base, dias), estimativa };
}

export type ItemCompletude = {
  comissao_percentual: number | null; comissao_valor: number; comissao_origem: "calculada" | "planilha"; comissao_planilha_ausente: boolean;
};

/**
 * F — completude (todos obrigatórios):
 *  F.1 (a) comissão DEFINIDA por item: % > 0 ou valor da planilha > 0 (zero não define; manual > 0 define).
 *          'comissao_zero_na_planilha' = planilha vazia/zerada havendo % · 'comissao_nao_definida' = sem %.
 *      (b) data de faturamento · (c) prazo da comissão na representada ('outro' exige referência e dias)
 *      (d) 'pagamento' (ou 'outro'+'pagamento') exige prazo do cliente (à vista = 0 dias).
 *  F.2 com motivo → incompleta, 'pendente_analise', NUNCA liquida · F.3 sem motivo → completa (segue G)
 *  F.4 item sem produto não é isento · F.5 recalculada quando o usuário corrige a origem do problema.
 */
export function verificarCompletudeComissao(
  pedido: PedidoPrevisao,
  itens: ItemCompletude[],
  representada: RepresentadaPrevisao,
  comissaoResolvida: { origem_calculo: OrigemCalculo | null; valor: number },
): { completa: boolean; motivos: MotivoPendencia[] } {
  const motivos: MotivoPendencia[] = [];
  if (comissaoResolvida.origem_calculo === "manual") {
    if (!(comissaoResolvida.valor > 0)) motivos.push("comissao_nao_definida");
  } else {
    if (itens.some((i) => !(i.comissao_origem === "planilha" && i.comissao_valor > 0) && !definido(i.comissao_percentual))) motivos.push("comissao_nao_definida");
    if (itens.some((i) => i.comissao_planilha_ausente && definido(i.comissao_percentual))) motivos.push("comissao_zero_na_planilha");
  }
  if (!pedido.data_faturamento) motivos.push("sem_data_faturamento");
  const r = representada;
  if (!r.comissao_pagamento_tipo || (r.comissao_pagamento_tipo === "outro" && (r.comissao_pagamento_dias == null || !r.comissao_pagamento_referencia))) {
    motivos.push("sem_prazo_pagamento_comissao");
  }
  const dependeCliente = r.comissao_pagamento_tipo === "pagamento" || (r.comissao_pagamento_tipo === "outro" && r.comissao_pagamento_referencia === "pagamento");
  if (dependeCliente && pedido.prazo_tipo === "a_prazo" && pedido.prazo_dias == null) motivos.push("sem_prazo_cliente");
  return { completa: motivos.length === 0, motivos };
}

/** G — elegível à liquidação automática (espelho de liquidar_comissoes). */
export function elegivelLiquidacao(c: {
  completude: string; status: string; origem: string; previsao: string | null; upload: string; data_recebimento_editada: boolean; reaberta_em: string | null; aprovada_em: string | null;
}): boolean {
  return c.origem === "importacao" && c.completude === "completa" && c.status === "prevista" && !!c.previsao && c.previsao < c.upload.slice(0, 10)
    && !c.data_recebimento_editada && !c.reaberta_em && !c.aprovada_em;
}

/**
 * Fase 22: "recebida" = LÍQUIDA (bruta − devoluções); recebida_bruta e devolucoes vêm separadas (nunca só o líquido).
 * M — TRÊS indicadores distintos do dashboard (nunca somados entre si): recebida (GROUP_RECEBIDO, pela data de
 * recebimento), a receber (GROUP_A_RECEBER, pela previsão) e em análise (GROUP_EM_ANALISE: valor E quantidade, pela
 * previsão). Cancelada fica fora. `noPeriodo` decide se a data cai no período.
 */
export function indicadoresComissao(
  comissoes: { status: string; valor: number; data_prevista_recebimento: string | null; data_recebimento: string | null; tipo?: string }[],
  noPeriodo: (data: string | null) => boolean,
): { recebida: number; recebida_bruta: number; devolucoes: number; a_receber: number; em_analise: { valor: number; quantidade: number } } {
  const r = { bruta: 0, devolucoes: 0, a_receber: 0, em_analise: { valor: 0, quantidade: 0 } };
  for (const c of comissoes) {
    const g = statusNoGrupo(c.status);
    if (g === "recebido" && noPeriodo(c.data_recebimento)) {
      // Fase 22 (H.1/H.2): o estorno recebido é negativo no mesmo grupo; mostrado à parte, em valor absoluto
      if (c.tipo === "estorno") r.devolucoes += Math.abs(Number(c.valor)); else r.bruta += Number(c.valor);
    } else if (g === "a_receber" && noPeriodo(c.data_prevista_recebimento)) r.a_receber += Number(c.valor);
    else if (g === "em_analise" && noPeriodo(c.data_prevista_recebimento)) { r.em_analise.valor += Number(c.valor); r.em_analise.quantidade++; }
  }
  const c2 = (v: number) => Math.round(v * 100) / 100;
  return {
    recebida: c2(r.bruta - r.devolucoes), recebida_bruta: c2(r.bruta), devolucoes: c2(r.devolucoes), a_receber: c2(r.a_receber),
    em_analise: { valor: c2(r.em_analise.valor), quantidade: r.em_analise.quantidade },
  };
}

/** K.3/K.4 — status resultante da edição manual da data de recebimento. */
export function statusPorDataEditada(data: string | null, hoje: string, completude: string): "recebida" | "prevista" | "pendente_analise" {
  if (!data) return completude === "incompleta" ? "pendente_analise" : "prevista";
  return data <= hoje ? "recebida" : "prevista";
}
