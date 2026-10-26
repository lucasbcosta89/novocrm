import { describe, expect, it } from "vitest";
import { analiseSpecSchema, bloqueioGrafico, hashSpec, METRICAS } from "@/lib/analises/catalogo";
import { agrupar, histograma, somarPor } from "@/lib/analises/grafico";
import { PRESETS, resolverPeriodo, specDoPreset } from "@/lib/analises/presets";
import { escreverEstado, formatarMetrica, lerEstado, variacao } from "@/lib/analises/url";

const AGORA = new Date("2026-10-24T15:00:00Z");
const vazio = { representada_id: [], cliente_id: [], produto_id: [], status: [], uf: [], canal: [] };

describe("análises — catálogo e spec", () => {
  const base = specDoPreset("representada", resolverPeriodo(null, null, null, AGORA).periodo, vazio, "itens");

  it("preset Por Representada: 4 KPIs, barra horizontal, dimensão representada", () => {
    expect(PRESETS.representada.kpis).toHaveLength(4);
    expect(base.dimensoes).toEqual(["representada"]);
    expect(base.grafico.tipo).toBe("barra_horizontal");
    expect(analiseSpecSchema.safeParse(base).success).toBe(true);
  });

  it("whitelist fechada: rejeita dimensão/métrica fora do catálogo e texto livre nos filtros", () => {
    expect(analiseSpecSchema.safeParse({ ...base, dimensoes: ["representada; drop table pedidos"] }).success).toBe(false);
    expect(analiseSpecSchema.safeParse({ ...base, metricas: ["margem_percentual"] }).success).toBe(false);
    expect(analiseSpecSchema.safeParse({ ...base, filtros: { ...vazio, representada_id: ["' or 1=1 --"] } }).success).toBe(false);
    expect(analiseSpecSchema.safeParse({ ...base, filtros: { ...vazio, uf: ["sp'"] } }).success).toBe(false);
    expect(analiseSpecSchema.safeParse({ ...base, dimensoes: ["cliente", "cliente"] }).success).toBe(false);
  });

  it("métricas não aditivas são marcadas (recalculadas no total)", () => {
    expect(METRICAS.ticket_medio.aditiva).toBe(false);
    expect(METRICAS.share.aditiva).toBe(false);
    expect(METRICAS.valor_liquido.aditiva).toBe(true);
  });

  it("gráfico aceita no máximo 2 dimensões", () => {
    expect(bloqueioGrafico({ dimensoes: ["representada", "tempo"] })).toBeNull();
    expect(bloqueioGrafico({ dimensoes: ["representada", "tempo", "uf"] })).toMatch(/no máximo 2/);
  });

  it("hash da spec é estável à ordem das chaves e muda com o período", () => {
    const reordenado = Object.fromEntries(Object.entries(base).reverse()) as typeof base;
    expect(hashSpec(reordenado)).toBe(hashSpec(base));
    expect(hashSpec({ ...base, periodo: { ...base.periodo, de: "2026-01-01" } })).not.toBe(hashSpec(base));
  });
});

describe("análises — período e URL", () => {
  it("default 90 dias (inclusivo, fuso SP) e presets", () => {
    expect(resolverPeriodo(null, null, null, AGORA)).toEqual({ preset: "90d", periodo: { campo: "data", de: "2026-07-27", ate: "2026-10-24" } });
    expect(resolverPeriodo("7d", null, null, AGORA).periodo.de).toBe("2026-10-18");
    expect(resolverPeriodo("ano_anterior", null, null, AGORA).periodo).toMatchObject({ de: "2025-01-01", ate: "2025-12-31" });
    expect(resolverPeriodo("personalizado", "2026-10-10", "2026-10-01", AGORA).preset).toBe("90d");
  });

  it("filtros globais vão e voltam pela query string", () => {
    const q = new URLSearchParams("p=30d&rep=a,b&uf=SP&gran=pedidos");
    const e = lerEstado(q, AGORA);
    expect(e.filtros.representada_id).toEqual(["a", "b"]);
    expect(e.granularidade).toBe("pedidos");
    expect(new URLSearchParams(escreverEstado(e)).get("rep")).toBe("a,b");
    expect(escreverEstado(lerEstado(new URLSearchParams(""), AGORA))).toBe("");
  });

  it("formatação e variação", () => {
    expect(formatarMetrica("valor_liquido", 21610)).toBe("R$ 21.610,00");
    expect(formatarMetrica("share", 12.345)).toBe("12,3%");
    expect(formatarMetrica("ticket_medio", null)).toBe("—");
    expect(variacao(150, 100)).toBe(50);
    expect(variacao(10, 0)).toBeNull();
  });
});

describe("análises — fase 2 (Cliente, Produto, Pedido)", () => {
  const periodo = resolverPeriodo(null, null, null, AGORA).periodo;

  it("cada aba carrega seu preset e a spec é válida no catálogo", () => {
    for (const id of ["cliente", "produto", "pedido"] as const) {
      const s = specDoPreset(id, periodo, vazio, "itens");
      expect(analiseSpecSchema.safeParse(s).success).toBe(true);
      expect(PRESETS[id].kpis).toHaveLength(4);
      expect(PRESETS[id].fase).toBe(2);
    }
    expect(specDoPreset("cliente", periodo, vazio, "itens").metricas).toContain("dias_sem_comprar");
    expect(specDoPreset("produto", periodo, vazio, "itens").grafico).toMatchObject({ tipo: "coluna_agrupada", dimensaoLinha: "categoria", dimensaoSerie: "representada" });
  });

  it("Por Pedido opera sempre na granularidade de cabeçalho de pedido; Por Produto, por item", () => {
    expect(specDoPreset("pedido", periodo, vazio, "itens")).toMatchObject({ granularidade: "pedidos", dataset: "pedidos" });
    expect(specDoPreset("produto", periodo, vazio, "pedidos").granularidade).toBe("itens");
    expect(specDoPreset("cliente", periodo, vazio, "pedidos").granularidade).toBe("pedidos");
  });

  it("filtros globais são os mesmos em todas as abas", () => {
    const f = { ...vazio, uf: ["SP"], representada_id: ["30445add-daf8-411d-bb3d-5345efeff8ab"] };
    for (const id of ["representada", "cliente", "produto", "pedido"] as const) expect(specDoPreset(id, periodo, f, "itens").filtros).toEqual(f);
  });

  it("gráfico deriva das mesmas linhas: rollup, colunas agrupadas e histograma", () => {
    const linhas = [
      { categoria: "Calçados", representada: "A", valor_liquido: 100 },
      { categoria: "Calçados", representada: "B", valor_liquido: 50 },
      { categoria: "Bolsas", representada: "A", valor_liquido: 30 },
    ];
    expect(somarPor(linhas, "categoria", "valor_liquido").map((p) => [p.nome, p.valor])).toEqual([["Calçados", 150], ["Bolsas", 30]]);
    expect(agrupar(linhas, "categoria", "representada", "valor_liquido")).toEqual({ series: ["A", "B"], dados: [{ nome: "Calçados", A: 100, B: 50 }, { nome: "Bolsas", A: 30 }] });
    const h = histograma([{ valor_liquido: 400 }, { valor_liquido: 1000 }, { valor_liquido: 30000 }], "valor_liquido");
    expect(h.map((f) => f.pedidos)).toEqual([1, 0, 1, 0, 0, 0, 1]);
  });

  it("formata data, dias e classe ABC", () => {
    expect(formatarMetrica("ultima_compra", "2026-10-11")).toBe("11/10/2026");
    expect(formatarMetrica("dias_sem_comprar", 95)).toBe("95 d");
    expect(formatarMetrica("classe_abc", "A")).toBe("A");
  });
});
