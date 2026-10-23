import { describe, expect, it } from "vitest";
import { agruparDespesas, despesaSchema, resolverPeriodo, totalDistinto, valorBRL, type DespesaLinha } from "@/lib/custos";

const R1 = { id: "11111111-1111-4111-8111-111111111111", nome: "Rep A" };
const R2 = { id: "22222222-2222-4222-8222-222222222222", nome: "Rep B" };
const C1 = { id: "33333333-3333-4333-8333-333333333333", nome: "Cliente X" };
const d = (id: string, data: string, valor: number, reps = [R1], clis: (typeof C1)[] = []): DespesaLinha =>
  ({ id, descricao: id, data, valor, observacoes: null, representadas: reps, clientes: clis });

describe("controle de custos (fase 11)", () => {
  it("valor em BRL com vírgula e validação da despesa", () => {
    expect(valorBRL("1.234,56")).toBe(1234.56);
    expect(valorBRL("R$ 80,5")).toBe(80.5);
    expect(valorBRL("99.9")).toBe(99.9);
    const p = despesaSchema.parse({ descricao: " Combustível ", data: "2026-10-20", valor: "150,00", representadas: [R1.id, R2.id], clientes: C1.id });
    expect(p).toMatchObject({ descricao: "Combustível", valor: 150, representadas: [R1.id, R2.id], clientes: [C1.id] });
    expect(despesaSchema.safeParse({ descricao: "", data: "2026-10-20", valor: "1" }).success).toBe(false);
    expect(despesaSchema.safeParse({ descricao: "X", data: "", valor: "1" }).success).toBe(false);
    expect(despesaSchema.safeParse({ descricao: "X", data: "2026-10-20", valor: "-5" }).success).toBe(false);
    expect(despesaSchema.safeParse({ descricao: "X", data: "2026-10-20", valor: "" }).success).toBe(false);
  });

  it("atalhos de período", () => {
    const hoje = "2026-10-23";
    expect(resolverPeriodo("este_mes", null, null, hoje)).toMatchObject({ de: "2026-10-01", ate: "2026-10-31" });
    expect(resolverPeriodo("mes_passado", null, null, hoje)).toMatchObject({ de: "2026-09-01", ate: "2026-09-30" });
    expect(resolverPeriodo("3m", null, null, hoje)).toMatchObject({ de: "2026-08-01", ate: hoje });
    expect(resolverPeriodo("ano", null, null, hoje)).toMatchObject({ de: "2026-01-01", ate: hoje });
    expect(resolverPeriodo("personalizado", "2026-10-05", "2026-10-10", hoje)).toMatchObject({ de: "2026-10-05", ate: "2026-10-10" });
    expect(resolverPeriodo("personalizado", "2026-10-10", "2026-10-05", hoje).atalho).toBe("este_mes");
  });

  it("agrupar por representada repete a despesa compartilhada mas o total geral conta uma vez", () => {
    const ds = [d("a", "2026-10-20", 100, [R1, R2], [C1]), d("b", "2026-10-05", 50, [R2]), d("c", "2026-09-30", 10, [])];
    const g = agruparDespesas(ds, "representada");
    expect(g.map((x) => [x.rotulo, x.subtotal])).toEqual([["Rep A", 100], ["Rep B", 150], ["Sem representada", 10]]);
    expect(totalDistinto(ds)).toBe(160);
    expect(agruparDespesas(ds, "mes").map((x) => [x.chave, x.subtotal])).toEqual([["2026-10", 150], ["2026-09", 10]]);
    expect(agruparDespesas(ds, "semana")[0]!.rotulo).toBe("Semana de 19/10/2026");
    expect(agruparDespesas(ds, "cliente").map((x) => x.rotulo)).toEqual(["Cliente X", "Sem cliente"]);
  });
});
