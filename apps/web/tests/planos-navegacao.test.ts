import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buscarSecao, SECOES } from "@/lib/navegacao";
import { PLANOS } from "@/lib/planos";

describe("planos", () => {
  it("limites batem com a especificação", () => {
    expect(PLANOS.solo).toEqual({ representadas: 1, clientes: 100, conversas_mes: 200 });
    expect(PLANOS.profissional).toEqual({ representadas: 3, clientes: 1000, conversas_mes: 500 });
    expect(PLANOS.pro).toEqual({ representadas: null, clientes: null, conversas_mes: 1500 });
  });

  it("seed do schema.sql espelha PLANOS", () => {
    const sql = readFileSync(path.resolve(__dirname, "../../../schema.sql"), "utf8");
    for (const [codigo, limites] of Object.entries(PLANOS)) {
      const linha = sql.split("\n").find((l) => l.includes(`('${codigo}',`));
      const json = linha?.match(/'(\{.*\})'/)?.[1];
      expect(json, codigo).toBeDefined();
      expect(JSON.parse(json!)).toEqual(limites);
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
