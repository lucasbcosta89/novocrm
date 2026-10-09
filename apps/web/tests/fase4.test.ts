import { describe, expect, it } from "vitest";
import { acaoSchema, oportunidadeSchema, oportunidadeUpdateSchema } from "@/lib/validacao";

describe("oportunidadeSchema", () => {
  it("aplica padrões e converte valor", () => {
    const o = oportunidadeSchema.parse({ tipo: "oportunidade", titulo: "Ampliar mix", valor_estimado: "1500,50", representada_id: "" });
    expect(o).toMatchObject({ prioridade: "media", status: "nao_iniciado", valor_estimado: 1500.5, representada_id: null });
  });
  it("valor vazio vira null; rejeita tipo/prioridade/status inválidos", () => {
    expect(oportunidadeSchema.parse({ tipo: "desafio", titulo: "Atraso", valor_estimado: "" }).valor_estimado).toBeNull();
    expect(oportunidadeSchema.safeParse({ tipo: "risco", titulo: "X1" }).success).toBe(false);
    expect(oportunidadeSchema.safeParse({ tipo: "desafio", titulo: "X1", prioridade: "urgente" }).success).toBe(false);
    expect(oportunidadeUpdateSchema.safeParse({ status: "fechada" }).success).toBe(false);
  });
  it("update parcial só com status", () => {
    expect(oportunidadeUpdateSchema.parse({ status: "em_progresso" })).toEqual({ status: "em_progresso" });
  });
});

describe("acaoSchema", () => {
  it("padrão pendente; prazo vazio vira null", () => {
    expect(acaoSchema.parse({ descricao: "Ligar", prazo: "", responsavel: "" })).toEqual({
      descricao: "Ligar", prazo: null, responsavel: null, status: "nao_iniciado",
    });
  });
  it("valida prazo e status", () => {
    expect(acaoSchema.parse({ descricao: "Ligar", prazo: "2026-10-20" }).prazo).toBe("2026-10-20");
    expect(acaoSchema.safeParse({ descricao: "Ligar", prazo: "20/10/2026" }).success).toBe(false);
    expect(acaoSchema.safeParse({ descricao: "Ligar", status: "feito" }).success).toBe(false);
  });
});

describe("schemas de update não aplicam defaults", () => {
  it("PATCH parcial mantém só os campos enviados", async () => {
    const v = await import("@/lib/validacao");
    expect(v.representadaUpdateSchema.parse({ nome: "Nova" })).toEqual({ nome: "Nova" });
    expect(v.produtoUpdateSchema.parse({ nome: "Caneta" })).toEqual({ nome: "Caneta" });
    expect(v.visitaUpdateSchema.parse({ resultado: "ok" })).toEqual({ resultado: "ok" });
    expect(v.acaoUpdateSchema.parse({ responsavel: "Ana" })).toEqual({ responsavel: "Ana" });
  });
});
