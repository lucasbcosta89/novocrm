import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

vi.mock("server-only", () => ({}));
const recebido: unknown[] = [];
vi.mock("@/server/contexto", () => ({ obterContexto: async () => ({}) }));
vi.mock("@/server/representadas", () => ({
  listarRepresentadasListagem: async (_ctx: unknown, filtro: unknown) => {
    recebido.push(filtro);
    return {
      linhas: [{
        codigo_representada: "REP-0001", razao_social: "Calçados São João Ltda", nome_fantasia: "São João", cnpj: "11222333000181",
        cidade: "Goiânia", uf: "GO", comissao_percentual: 5.5, status: "ativa", clientes_vinculados: 3, valor_vendido_90d: 1234.5,
      }],
    };
  },
}));

describe("exportar representadas (CSV e XLSX)", () => {
  it("mesma visão filtrada nos dois formatos; XLSX com números como número", async () => {
    const { GET } = await import("@/app/api/representadas/exportar/route");
    const req = (q: string) => ({ nextUrl: new URL(`http://x/api/representadas/exportar${q}`) }) as never;

    const csv = await GET(req("?uf=GO&formato=csv"));
    expect(csv.headers.get("content-disposition")).toMatch(/representadas-\d{4}-\d{2}-\d{2}\.csv/);
    const linhaCsv = new TextDecoder().decode(new Uint8Array(await csv.arrayBuffer())).split("\r\n")[1];
    expect(linhaCsv).toBe("REP-0001;Calçados São João Ltda;São João;11.222.333/0001-81;Goiânia;GO;5,5;Ativa;3;1234,5");

    const xlsx = await GET(req("?uf=GO&formato=xlsx"));
    expect(xlsx.headers.get("content-type")).toContain("spreadsheetml");
    const wb = XLSX.read(new Uint8Array(await xlsx.arrayBuffer()));
    expect(wb.SheetNames).toEqual(["Representadas"]);
    const m = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Representadas!, { header: 1 });
    expect(m[0]![0]).toBe("Código");
    expect(m[1]).toEqual(["REP-0001", "Calçados São João Ltda", "São João", "11.222.333/0001-81", "Goiânia", "GO", 5.5, "Ativa", 3, 1234.5]);
    expect(recebido).toEqual([{ uf: "GO", formato: "csv" }, { uf: "GO", formato: "xlsx" }]); // filtros da tela chegam iguais
  });
});
