import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assinaturaFiltro, contarFiltrosAtivos, lerFiltroComissoes, periodoDoFiltro, urlComissoes } from "@/lib/comissoes/filtro";
import {
  calcularPrevisaoRecebimento, elegivelLiquidacao, indicadoresComissao, resolverPercentualComissao, statusPorDataEditada, verificarCompletudeComissao,
  type ItemCompletude, type RepresentadaPrevisao,
} from "@/lib/comissoes/regras";
import {
  acoesDoStatus, AVISO_PENDENTES_ANALISE, GROUP_A_RECEBER, GROUP_EM_ANALISE, GROUP_RECEBIDO, ROTULOS_MOTIVO, rotuloTotal, selecionavelEmLote, statusDosGrupos,
  statusNoGrupo, type OrigemCalculo,
} from "@/lib/comissoes/status";
import { totalizar } from "@/server/comissoes";

describe("fase 21 — mapa único de status (B)", () => {
  it("grupos exatos e status legados fora do mapa", () => {
    expect([GROUP_RECEBIDO, GROUP_A_RECEBER, GROUP_EM_ANALISE]).toEqual([["recebida"], ["prevista", "reaberta"], ["pendente_analise"]]);
    expect(["prevista", "reaberta", "recebida", "pendente_analise", "cancelada", "a_receber", "atrasada"].map(statusNoGrupo))
      .toEqual(["a_receber", "a_receber", "recebido", "em_analise", "desconhecido", "desconhecido", "desconhecido"]);
    expect(statusDosGrupos(["recebido", "a_receber"])).toEqual(["recebida", "prevista", "reaberta"]);
  });
  it("motivos com o texto legível exato (H.2) e aviso agregado exato (O.1)", () => {
    expect(Object.values(ROTULOS_MOTIVO)).toEqual([
      "Comissão não definida", "Comissão zerada na planilha", "Pedido sem data de faturamento",
      "Representada sem prazo de pagamento da comissão", "Pedido sem prazo de pagamento do cliente",
    ]);
    expect(AVISO_PENDENTES_ANALISE).toBe("Você possui comissões pendentes de análise");
  });
  it("seleção em lote e ações por status (I.9 / Q.2)", () => {
    expect(["prevista", "pendente_analise", "recebida", "reaberta", "cancelada"].map(selecionavelEmLote)).toEqual([true, true, false, false, false]);
    expect(acoesDoStatus("pendente_analise")).toMatchObject({ analisar: true, marcarRecebida: false, definir: true });
    expect(acoesDoStatus("recebida")).toMatchObject({ reabrir: true, definir: false });
    expect(acoesDoStatus("cancelada")).toMatchObject({ editarData: false, cancelada: true });
  });
  it("total declara os grupos somados (N.4)", () => {
    expect(rotuloTotal(["recebido", "a_receber"])).toBe("Total recebida + a receber (exclui em análise)");
    expect(rotuloTotal(["recebido"])).toBe("Total recebida (exclui em análise)");
  });
  it("NENHUM filtro de status de comissão escrito à mão fora de lib/comissoes (B.2/B.3)", () => {
    const raiz = join(__dirname, "..", "src");
    const arquivos: string[] = [];
    const varrer = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) varrer(p); else if (/\.(ts|tsx)$/.test(n)) arquivos.push(p); } };
    varrer(raiz);
    const proibido = /(\.(eq|neq|in)\(\s*"status"\s*,\s*\[?\s*"(a_receber|recebida|atrasada|prevista|reaberta|pendente_analise)")|(status\s*[!=]==\s*"(a_receber|recebida|atrasada|prevista|reaberta|pendente_analise)")/;
    const ofensores = arquivos.filter((a) => !a.includes(join("lib", "comissoes")) && !a.endsWith("whatsapp.ts") && proibido.test(readFileSync(a, "utf8")));
    expect(ofensores).toEqual([]);
  });
});

describe("fase 21 — dashboard: três indicadores distintos (M)", () => {
  it("10 recebidas, 5 a receber e 3 em análise → exatamente 10, 5 e 3 (nunca 15 nem 18)", () => {
    const d = "2026-11-10";
    const lista = [
      ...Array.from({ length: 10 }, () => ({ status: "recebida", valor: 1, data_prevista_recebimento: d, data_recebimento: d })),
      ...Array.from({ length: 3 }, () => ({ status: "prevista", valor: 1, data_prevista_recebimento: d, data_recebimento: null })),
      ...Array.from({ length: 2 }, () => ({ status: "reaberta", valor: 1, data_prevista_recebimento: d, data_recebimento: null })),
      ...Array.from({ length: 3 }, () => ({ status: "pendente_analise", valor: 1, data_prevista_recebimento: d, data_recebimento: null })),
      { status: "cancelada", valor: 99, data_prevista_recebimento: d, data_recebimento: null },
    ];
    const r = indicadoresComissao(lista, (x) => !!x && x.startsWith("2026-11"));
    expect(r).toEqual({ recebida: 10, a_receber: 5, em_analise: { valor: 3, quantidade: 3 } });
    expect(indicadoresComissao([], () => true)).toEqual({ recebida: 0, a_receber: 0, em_analise: { valor: 0, quantidade: 0 } });
    expect(totalizar(lista)).toEqual({ recebido: { valor: 10, quantidade: 10 }, a_receber: { valor: 5, quantidade: 5 }, em_analise: { valor: 3, quantidade: 3 } });
  });
});

describe("fase 21 — precedência (D)", () => {
  it("representada 5% e catálogo 3% → 5% representada; vazia + 3% → catálogo; nada → zero; sem produto → representada", () => {
    expect(resolverPercentualComissao({ comissao: 3 }, { comissao_percentual: 5 })).toEqual({ percentual: 5, origem_calculo: "representada" });
    expect(resolverPercentualComissao({ comissao: 3 }, { comissao_percentual: null })).toEqual({ percentual: 3, origem_calculo: "catalogo" });
    expect(resolverPercentualComissao({ comissao: 0 }, { comissao_percentual: 0 })).toEqual({ percentual: 0, origem_calculo: "zero" });
    expect(resolverPercentualComissao(null, { comissao_percentual: 5 })).toEqual({ percentual: 5, origem_calculo: "representada" });
    expect(resolverPercentualComissao(null, { comissao_percentual: null })).toEqual({ percentual: 0, origem_calculo: "zero" });
  });
});

const rep = (o: Partial<RepresentadaPrevisao> = {}): RepresentadaPrevisao => ({ comissao_pagamento_tipo: "faturamento", comissao_pagamento_referencia: null, comissao_pagamento_dias: null, ...o });
const ped = (o: Partial<{ data_faturamento: string | null; data: string | null; prazo_tipo: string | null; prazo_dias: number | null }> = {}) =>
  ({ data_faturamento: "2026-10-01", data: "2026-09-20T15:00:00Z", prazo_tipo: "a_prazo", prazo_dias: 30, ...o });

describe("fase 21 — previsão de recebimento (E)", () => {
  it("E.1–E.4", () => {
    expect(calcularPrevisaoRecebimento(ped(), rep())).toEqual({ previsao: "2026-10-01", estimativa: false });
    expect(calcularPrevisaoRecebimento(ped(), rep({ comissao_pagamento_tipo: "pagamento" }))).toEqual({ previsao: "2026-10-31", estimativa: false });
    expect(calcularPrevisaoRecebimento(ped(), rep({ comissao_pagamento_tipo: "outro", comissao_pagamento_referencia: "faturamento", comissao_pagamento_dias: 10 }))).toEqual({ previsao: "2026-10-11", estimativa: false });
    expect(calcularPrevisaoRecebimento(ped(), rep({ comissao_pagamento_tipo: "outro", comissao_pagamento_referencia: "pagamento", comissao_pagamento_dias: 10 }))).toEqual({ previsao: "2026-11-10", estimativa: false });
    expect(calcularPrevisaoRecebimento(ped({ prazo_tipo: "a_vista", prazo_dias: null }), rep({ comissao_pagamento_tipo: "pagamento" }))).toEqual({ previsao: "2026-10-01", estimativa: false }); // à vista = 0
  });
  it("E.5 estimativa sem faturamento (usa a data do pedido) · E.6 sem base = Sem previsão", () => {
    expect(calcularPrevisaoRecebimento(ped({ data_faturamento: null }), rep())).toEqual({ previsao: "2026-09-20", estimativa: true });
    expect(calcularPrevisaoRecebimento(ped({ prazo_dias: null }), rep({ comissao_pagamento_tipo: "pagamento" })).estimativa).toBe(true);
    expect(calcularPrevisaoRecebimento(ped({ data_faturamento: null, data: null }), rep())).toEqual({ previsao: null, estimativa: true });
  });
});

const item = (o: Partial<ItemCompletude> = {}): ItemCompletude => ({ comissao_percentual: 5, comissao_valor: 5, comissao_origem: "calculada", comissao_planilha_ausente: false, ...o });
const auto: { origem_calculo: OrigemCalculo | null; valor: number } = { origem_calculo: "representada", valor: 5 };

describe("fase 21 — completude (F)", () => {
  it("completa só com todos os dados", () => {
    expect(verificarCompletudeComissao(ped(), [item()], rep(), auto)).toEqual({ completa: true, motivos: [] });
  });
  it("cada motivo isolado", () => {
    const m = (p: ReturnType<typeof ped>, i: ItemCompletude[], r: RepresentadaPrevisao, c = auto) => verificarCompletudeComissao(p, i, r, c).motivos;
    expect(m(ped(), [item({ comissao_percentual: 0, comissao_valor: 0 })], rep())).toEqual(["comissao_nao_definida"]);
    expect(m(ped(), [item({ comissao_planilha_ausente: true })], rep())).toEqual(["comissao_zero_na_planilha"]); // zero na planilha com 5%: valor calculado, mas incompleta
    expect(m(ped(), [item({ comissao_origem: "planilha", comissao_valor: 12, comissao_percentual: 0 })], rep())).toEqual([]); // planilha > 0 define
    expect(m(ped({ data_faturamento: null }), [item()], rep())).toEqual(["sem_data_faturamento"]);
    expect(m(ped(), [item()], rep({ comissao_pagamento_tipo: "outro", comissao_pagamento_referencia: "faturamento", comissao_pagamento_dias: null }))).toEqual(["sem_prazo_pagamento_comissao"]);
    expect(m(ped(), [item()], rep({ comissao_pagamento_tipo: null }))).toEqual(["sem_prazo_pagamento_comissao"]);
    expect(m(ped({ prazo_dias: null }), [item()], rep({ comissao_pagamento_tipo: "pagamento" }))).toEqual(["sem_prazo_cliente"]);
    expect(m(ped(), [item({ comissao_percentual: 0, comissao_valor: 0 })], rep(), { origem_calculo: "manual", valor: 8 })).toEqual([]); // definida manualmente
    expect(m(ped(), [item()], rep(), { origem_calculo: "manual", valor: 0 })).toEqual(["comissao_nao_definida"]); // zero nunca define
  });
});

describe("fase 21 — liquidação (G) e edição de data (K)", () => {
  const base = { completude: "completa", status: "prevista", origem: "importacao", previsao: "2026-10-01", upload: "2026-11-16T10:00:00Z", data_recebimento_editada: false, reaberta_em: null, aprovada_em: null };
  it("só importado, completo, previsto antes do upload, sem edição/reabertura/aprovação", () => {
    expect(elegivelLiquidacao(base)).toBe(true);
    expect(elegivelLiquidacao({ ...base, completude: "incompleta" })).toBe(false);
    expect(elegivelLiquidacao({ ...base, origem: "app" })).toBe(false);
    expect(elegivelLiquidacao({ ...base, previsao: "2026-12-20" })).toBe(false);
    expect(elegivelLiquidacao({ ...base, data_recebimento_editada: true })).toBe(false);
    expect(elegivelLiquidacao({ ...base, status: "reaberta" })).toBe(false);
    expect(elegivelLiquidacao({ ...base, reaberta_em: "2026-11-01" })).toBe(false);
  });
  it("data passada → recebida; futura → prevista; remover → prevista (completa) ou pendente (incompleta)", () => {
    expect(statusPorDataEditada("2026-11-01", "2026-11-16", "completa")).toBe("recebida");
    expect(statusPorDataEditada("2026-11-16", "2026-11-16", "incompleta")).toBe("recebida");
    expect(statusPorDataEditada("2027-01-10", "2026-11-16", "completa")).toBe("prevista");
    expect(statusPorDataEditada(null, "2026-11-16", "completa")).toBe("prevista");
    expect(statusPorDataEditada(null, "2026-11-16", "incompleta")).toBe("pendente_analise");
  });
});

describe("fase 21 — filtro temporal na URL (P)", () => {
  it("presets e período padrão 'este mês' pela previsão", () => {
    const f = lerFiltroComissoes({});
    expect([f.p, f.campo, f.visao]).toEqual(["este_mes", "previsao", "lista"]);
    expect(periodoDoFiltro(f, "2026-11-16")).toMatchObject({ de: "2026-11-01", ate: "2026-11-30" });
    expect(periodoDoFiltro(lerFiltroComissoes({ p: "7d" }), "2026-11-16")).toMatchObject({ de: "2026-11-10", ate: "2026-11-16" });
    expect(periodoDoFiltro(lerFiltroComissoes({ p: "90d" }), "2026-11-16")).toMatchObject({ de: "2026-08-19", ate: "2026-11-16" });
    expect(periodoDoFiltro(lerFiltroComissoes({ p: "ano_anterior" }), "2026-11-16")).toMatchObject({ de: "2025-01-01", ate: "2025-12-31" });
  });
  it("URL ida e volta; chip conta filtros; paginar/ordenar NÃO muda a assinatura (seleção sobrevive), mudar filtro muda", () => {
    const f = lerFiltroComissoes({ p: "30d", campo: "sem_previsao", g: "recebido,a_receber", mot: "sem_data_faturamento", lote: "1", ed: "1", pag: "3", ord: "valor" });
    expect(lerFiltroComissoes(Object.fromEntries(new URL(`http://x${urlComissoes(f)}`).searchParams))).toEqual(f);
    expect(contarFiltrosAtivos(f)).toBe(6);
    expect(assinaturaFiltro({ ...f, pag: 9, ord: "pedido", dir: "desc" })).toBe(assinaturaFiltro(f));
    expect(assinaturaFiltro({ ...f, mot: undefined })).not.toBe(assinaturaFiltro(f));
    expect(lerFiltroComissoes({ rep: ["00000000-0000-4000-8000-000000000001", "lixo"] }).rep).toEqual([]); // inválido descartado sem quebrar
  });
});
