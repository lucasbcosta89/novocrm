import { describe, expect, it } from "vitest";
import { calendarioQuerySchema, eventoAtrasado, reagendarSchema } from "@/lib/calendario";

const ID = "33333333-3333-4333-8333-333333333333";
const agora = new Date("2026-10-21T15:00:00-03:00");

describe("calendário (fase 4e)", () => {
  it("faixa vermelha só para data passada sem conclusão/cancelamento", () => {
    expect(eventoAtrasado({ data: "2026-10-20", dia_inteiro: true, concluida: false, cancelada: false }, agora)).toBe(true);
    expect(eventoAtrasado({ data: "2026-10-21", dia_inteiro: true, concluida: false, cancelada: false }, agora)).toBe(false);
    expect(eventoAtrasado({ data: "2026-10-20", dia_inteiro: true, concluida: true, cancelada: false }, agora)).toBe(false);
    expect(eventoAtrasado({ data: "2026-10-20", dia_inteiro: true, concluida: false, cancelada: true }, agora)).toBe(false);
    expect(eventoAtrasado({ data: "2026-10-21T13:00:00.000Z", dia_inteiro: false, concluida: false, cancelada: false }, agora)).toBe(true);
    expect(eventoAtrasado({ data: "2026-10-22T13:00:00.000Z", dia_inteiro: false, concluida: false, cancelada: false }, agora)).toBe(false);
  });

  it("valida intervalo e tipos da consulta", () => {
    expect(calendarioQuerySchema.parse({ inicio: "2026-10-01", fim: "2026-11-01", tipos: "visita,tarefa" }).tipos).toEqual(["visita", "tarefa"]);
    expect(calendarioQuerySchema.parse({ inicio: "2026-10-01", fim: "2026-10-07" }).tipos).toEqual(["visita", "subtarefa", "tarefa"]);
    expect(calendarioQuerySchema.safeParse({ inicio: "2026-10-07", fim: "2026-10-01" }).success).toBe(false);
    expect(calendarioQuerySchema.safeParse({ inicio: "2026-01-01", fim: "2026-12-31" }).success).toBe(false);
    expect(calendarioQuerySchema.safeParse({ inicio: "2026-10-01", fim: "2026-10-07", tipos: "reuniao" }).success).toBe(false);
  });

  it("reagendar: visita com data/hora, sub-tarefa e tarefa com dia", () => {
    expect(reagendarSchema.safeParse({ tipo: "visita", id: ID, data: "2026-10-25T13:00:00.000Z" }).success).toBe(true);
    expect(reagendarSchema.safeParse({ tipo: "visita", id: ID, data: "2026-10-25" }).success).toBe(false);
    expect(reagendarSchema.safeParse({ tipo: "subtarefa", id: ID, data: "2026-10-25" }).success).toBe(true);
    expect(reagendarSchema.safeParse({ tipo: "tarefa", id: ID, data: "25/10/2026" }).success).toBe(false);
  });
});
