import { describe, expect, it } from "vitest";
import { paraInputDataHora } from "@/lib/formato";
import { comParam } from "@/lib/url";
import { visitaSchema } from "@/lib/validacao";

describe("visitaSchema", () => {
  it("converte datetime-local para ISO em horário de Brasília", () => {
    const v = visitaSchema.parse({ data: "2026-10-06T14:30", tipo: "telefone", representada_id: "", resultado: "" });
    expect(v).toMatchObject({ data: "2026-10-06T14:30:00-03:00", tipo: "telefone", representada_id: null, resultado: null });
    expect(new Date(v.data).toISOString()).toBe("2026-10-06T17:30:00.000Z");
  });
  it("tipo padrão presencial; rejeita tipo e data inválidos", () => {
    expect(visitaSchema.parse({ data: "2026-10-06T08:00" }).tipo).toBe("presencial");
    expect(visitaSchema.safeParse({ data: "2026-10-06T08:00", tipo: "fax" }).success).toBe(false);
    expect(visitaSchema.safeParse({ data: "ontem" }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("paraInputDataHora usa fuso de Brasília", () => {
    expect(paraInputDataHora("2026-10-06T17:30:00Z")).toBe("2026-10-06T14:30");
  });
  it("comParam preserva fragmento", () => {
    expect(comParam("/app/clientes/1#visitas", "ok", "Visita registrada")).toBe("/app/clientes/1?ok=Visita%20registrada#visitas");
    expect(comParam("/a?x=1", "erro", "y")).toBe("/a?x=1&erro=y");
  });
});
