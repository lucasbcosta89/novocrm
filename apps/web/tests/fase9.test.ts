import { describe, expect, it } from "vitest";
import { dashboardQuerySchema, janelas, naJanela, pontoDe, serie, somarPor, topN, variacao } from "@/lib/dashboard";

const agora = new Date("2026-10-21T15:00:00-03:00");
const REP = "33333333-3333-4333-8333-333333333333";

describe("dashboard principal (fase 9-1)", () => {
  it("períodos: Esse mês (padrão), 30 dias e Personalizado (exige as duas datas)", () => {
    expect(dashboardQuerySchema.parse({})).toEqual({ periodo: "mes", representada_id: "todas", de: null, ate: null });
    expect(dashboardQuerySchema.parse({ periodo: "30d", representada_id: REP, de: "2026-01-01" })).toEqual({ periodo: "30d", representada_id: REP, de: null, ate: null });
    expect(dashboardQuerySchema.parse({ periodo: "personalizado", de: "2026-10-31", ate: "2026-10-01" })).toMatchObject({ de: "2026-10-01", ate: "2026-10-31" });
    expect(dashboardQuerySchema.safeParse({ periodo: "personalizado", de: "2026-10-01" }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ periodo: "personalizado", de: "2020-01-01", ate: "2026-10-01" }).success).toBe(false); // > 2 anos
    expect(dashboardQuerySchema.safeParse({ periodo: "6m" }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ representada_id: "abc" }).success).toBe(false);
  });

  it("Esse mês: mês corrente inteiro, por dia, × mês anterior inteiro", () => {
    const { atual, anterior } = janelas({ periodo: "mes", de: null, ate: null }, agora);
    expect(atual.granularidade).toBe("dia");
    expect(atual.pontos).toHaveLength(31);
    expect([atual.pontos[0], atual.pontos.at(-1)]).toEqual(["2026-10-01", "2026-10-31"]);
    expect(naJanela("2026-10-01T03:00:00Z", atual)).toBe(true);
    expect(naJanela("2026-10-01T02:59:00Z", atual)).toBe(false); // 30/09 23:59 em Brasília
    expect(naJanela("2026-10-31", atual)).toBe(true); // comissões previstas e despesas do mês inteiro
    expect(naJanela("2026-09-01", anterior)).toBe(true);
    expect(naJanela("2026-09-30", anterior)).toBe(true);
    expect(naJanela("2026-10-01", anterior)).toBe(false);
  });

  it("30 dias: até hoje × os 30 dias anteriores", () => {
    const { atual, anterior } = janelas({ periodo: "30d", de: null, ate: null }, agora);
    expect([atual.pontos[0], atual.pontos.at(-1), atual.pontos.length]).toEqual(["2026-09-22", "2026-10-21", 30]);
    expect(naJanela("2026-10-22", atual)).toBe(false);
    expect(naJanela("2026-08-23", anterior)).toBe(true);
    expect(naJanela("2026-09-21", anterior)).toBe(true);
    expect(naJanela("2026-09-22", anterior)).toBe(false);
  });

  it("Personalizado: datas inclusivas × mesmo nº de dias antes; gráfico por mês acima de ~2 meses", () => {
    const curto = janelas({ periodo: "personalizado", de: "2026-10-05", ate: "2026-10-14" }, agora);
    expect([curto.atual.granularidade, curto.atual.pontos.length]).toEqual(["dia", 10]);
    expect(naJanela("2026-10-14", curto.atual)).toBe(true);
    expect(naJanela("2026-09-25", curto.anterior)).toBe(true);
    expect(naJanela("2026-10-05", curto.anterior)).toBe(false);
    const longo = janelas({ periodo: "personalizado", de: "2026-01-15", ate: "2026-06-10" }, agora);
    expect(longo.atual.granularidade).toBe("mes");
    expect(longo.atual.pontos).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
    expect(pontoDe("2026-03-10T15:00:00Z", "mes")).toBe("2026-03");
    expect(pontoDe("2026-10-01T02:00:00Z", "dia")).toBe("2026-09-30"); // fuso de Brasília
  });

  it("variação, série dos pontos e ranking", () => {
    expect(variacao(150, 100)).toBe(50);
    expect(variacao(0, 0)).toBe(0);
    expect(variacao(10, 0)).toBeNull();
    const porPonto = somarPor([{ p: "2026-10-03", v: 10.1 }, { p: "2026-10-03", v: 0.2 }, { p: "2026-10-01", v: 5 }], (x) => x.p, (x) => x.v);
    expect(serie(["2026-10-01", "2026-10-02", "2026-10-03"], porPonto)).toEqual([
      { ponto: "2026-10-01", valor: 5 }, { ponto: "2026-10-02", valor: 0 }, { ponto: "2026-10-03", valor: 10.3 },
    ]);
    expect(topN(new Map([["a", 1], ["b", 3]]), new Map([["b", "B"]]), 1)).toEqual([{ id: "b", nome: "B", valor: 3 }]);
  });
});

describe("edição de tarefa pelo dashboard", () => {
  it("valida título, data e conclusão da tarefa avulsa", async () => {
    const { tarefaUpdateSchema } = await import("@/lib/validacao");
    expect(tarefaUpdateSchema.parse({ titulo: " Ligar ", data: "2026-10-30", concluida: true })).toEqual({ titulo: "Ligar", data: "2026-10-30", concluida: true });
    expect(tarefaUpdateSchema.parse({ data: "" })).toEqual({ data: null });
    expect(tarefaUpdateSchema.safeParse({ titulo: "x" }).success).toBe(false);
    expect(tarefaUpdateSchema.safeParse({ data: "30/10/2026" }).success).toBe(false);
  });
});
