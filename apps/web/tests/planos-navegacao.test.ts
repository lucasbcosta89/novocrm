import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buscarSecao, SECOES } from "@/lib/navegacao";
import { PLANOS } from "@/lib/planos";

describe("planos", () => {
  it("preços e limites batem com a especificação", () => {
    expect([PLANOS.solo.preco, PLANOS.profissional.preco, PLANOS.pro.preco]).toEqual([49, 89, 149]);
    expect(PLANOS.solo.limites).toMatchObject({ representadas: 1, clientes: 100, conversas_mes: 200 });
    expect(PLANOS.profissional.limites).toMatchObject({ representadas: 3, clientes: 1000, conversas_mes: 500 });
    expect(PLANOS.pro.limites).toMatchObject({ representadas: null, clientes: null, conversas_mes: 1500 });
  });

  it("seed da Fase 6 em schema.sql espelha PLANOS", () => {
    const sql = readFileSync(path.resolve(__dirname, "../../../schema.sql"), "utf8");
    for (const [codigo, p] of Object.entries(PLANOS)) {
      const linha = sql.split("\n").find((l) => l.startsWith("update planos set preco") && l.includes("where codigo = '" + codigo + "'"));
      const m = linha?.match(/preco = (\d+),\s+limites = '(\{.*\})'/);
      expect(m, codigo).toBeTruthy();
      expect(Number(m![1])).toBe(p.preco);
      expect(JSON.parse(m![2]!)).toEqual(p.limites);
    }
  });
});

describe("navegação", () => {
  it("sidebar tem as 6 seções na ordem", () => {
    expect(SECOES.map((s) => s.titulo)).toEqual([
      "Representadas", "Clientes", "Oportunidades", "Comissões", "Relatórios", "Configurar",
    ]);
    expect(buscarSecao("clientes")?.titulo).toBe("Clientes");
    expect(buscarSecao("xpto")).toBeUndefined();
  });
});
