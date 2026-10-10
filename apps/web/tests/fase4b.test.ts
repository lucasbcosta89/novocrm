import { describe, expect, it } from "vitest";
import { resumoOportunidades } from "@/lib/oportunidades";
import { acaoSchema, novaOportunidadeSchema, oportunidadeUpdateSchema, resultadoSchema, STATUS_OPORTUNIDADE } from "@/lib/validacao";

const REP = "11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";
const P2 = "33333333-3333-4333-8333-333333333333";

describe("status unificados", () => {
  it("5 colunas do kanban", () => {
    expect(STATUS_OPORTUNIDADE).toEqual(["nao_iniciado", "em_progresso", "atrasado", "cancelado", "concluido"]);
    expect(oportunidadeUpdateSchema.safeParse({ status: "aberta" }).success).toBe(false);
    expect(acaoSchema.parse({ descricao: "Ligar" }).status).toBe("nao_iniciado");
  });
});

describe("nova oportunidade (página global)", () => {
  const base = { titulo: "Linha escolar 2027", representada_id: REP, cidade: "Goiânia", estado: "go" };
  it("exige representada; normaliza UF; aceita 2 produtos e 2 ações", () => {
    const o = novaOportunidadeSchema.parse({
      ...base,
      produtos: [{ produto_id: P1, quantidade: "2" }, { produto_id: P2 }],
      acoes: [
        { descricao: "Apresentar mix", status: "em_progresso", prazo: "2026-10-20", data_entrega: "", observacoes: "" },
        { descricao: "Enviar proposta", prazo: "2026-10-25" },
      ],
    });
    expect(o).toMatchObject({ tipo: "oportunidade", status: "nao_iniciado", estado: "GO" });
    expect(o.produtos).toEqual([{ produto_id: P1, quantidade: 2 }, { produto_id: P2, quantidade: 1 }]);
    expect(o.acoes[0]).toMatchObject({ status: "em_progresso", data_entrega: null, observacoes: null });
    expect(novaOportunidadeSchema.safeParse({ ...base, representada_id: "" }).success).toBe(false);
  });
  it("recusa produto repetido", () => {
    expect(novaOportunidadeSchema.safeParse({ ...base, produtos: [{ produto_id: P1 }, { produto_id: P1 }] }).success).toBe(false);
  });
});

describe("conclusão e log", () => {
  it("resultado ganhou/perdeu", () => {
    expect(resultadoSchema.parse({ resultado: "ganhou", observacoes_resultado: "Fechou 3 lojas" }).resultado).toBe("ganhou");
    expect(resultadoSchema.safeParse({ resultado: "empate" }).success).toBe(false);
  });
  it("contadores: 1 ganha de 1 = 100%", () => {
    expect(resumoOportunidades([{ resultado: "ganhou" }])).toEqual({ total: 1, ganhas: 1, perdidas: 0, aproveitamento: 100 });
    expect(resumoOportunidades([{ resultado: "ganhou" }, { resultado: "perdeu" }, { resultado: "perdeu" }, { resultado: null }]))
      .toEqual({ total: 4, ganhas: 1, perdidas: 2, aproveitamento: 33.3 });
    expect(resumoOportunidades([]).aproveitamento).toBe(0);
  });
});

describe("Fase 4c: produto da oportunidade", () => {
  it("quantidade padrão 1 e validação", async () => {
    const { produtoOportunidadeSchema } = await import("@/lib/validacao");
    expect(produtoOportunidadeSchema.parse({ produto_id: P1 })).toEqual({ produto_id: P1, quantidade: 1 });
    expect(produtoOportunidadeSchema.parse({ produto_id: P1, quantidade: "2,5" }).quantidade).toBe(2.5);
    expect(produtoOportunidadeSchema.safeParse({ produto_id: P1, quantidade: 0 }).success).toBe(false);
    expect(produtoOportunidadeSchema.safeParse({ produto_id: "x" }).success).toBe(false);
  });
});
