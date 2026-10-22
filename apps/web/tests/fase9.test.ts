import { describe, expect, it } from "vitest";
import { dashboardQuerySchema, janelas, naJanela, serieMensal, somarPor, topN, variacao } from "@/lib/dashboard";

const agora = new Date("2026-10-21T15:00:00-03:00");

describe("dashboard principal (fase 9-1)", () => {
  it("defaults e validação dos parâmetros", () => {
    expect(dashboardQuerySchema.parse({})).toEqual({ periodo: "6m", representada_id: "todas" });
    expect(dashboardQuerySchema.parse({ periodo: "ano", representada_id: "33333333-3333-4333-8333-333333333333" }).periodo).toBe("ano");
    expect(dashboardQuerySchema.safeParse({ periodo: "2m" }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ representada_id: "abc" }).success).toBe(false);
  });

  it("janelas: N meses até o atual e o período anterior equivalente", () => {
    const j6 = janelas("6m", agora);
    expect(j6.atual.meses).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(j6.anterior.meses[0]).toBe("2025-11");
    expect(j6.anterior.meses.at(-1)).toBe("2026-04");
    const ja = janelas("ano", agora);
    expect(ja.atual.meses).toHaveLength(10);
    expect(ja.anterior.meses[0]).toBe("2025-01");
    expect(janelas("12m", agora).atual.meses[0]).toBe("2025-11");
    expect(naJanela("2026-05-01T03:00:00Z", j6.atual)).toBe(true);
    expect(naJanela("2026-05-01T02:59:00Z", j6.atual)).toBe(false); // 30/04 23:59 em Brasília
    expect(naJanela("2026-10-31", ja.atual)).toBe(false); // depois de agora
  });

  it("variação, série mensal e ranking", () => {
    expect(variacao(150, 100)).toBe(50);
    expect(variacao(0, 0)).toBe(0);
    expect(variacao(10, 0)).toBeNull();
    const porMes = somarPor([{ m: "2026-10", v: 10.1 }, { m: "2026-10", v: 0.2 }, { m: "2026-08", v: 5 }], (x) => x.m, (x) => x.v);
    expect(serieMensal(["2026-08", "2026-09", "2026-10"], porMes)).toEqual([{ mes: "2026-08", valor: 5 }, { mes: "2026-09", valor: 0 }, { mes: "2026-10", valor: 10.3 }]);
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
