import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { gerarXlsx } from "@/lib/planilha";

vi.mock("server-only", () => ({}));

const clientes = [
  {
    id: "1", nome: "Loja São João", documento: "11222333000181", email: "a@a.com", celular: null, whatsapp: "62999998888",
    cidade: "Goiânia", uf: "GO", cep: "74000000", segmento: "Varejo", anotacoes: "Paga em dia; cliente antigo", status: "ativo",
    criado_em: "2026-10-01T12:00:00Z", representadas: [{ id: "r1", nome: "Alfa" }, { id: "r2", nome: "Beta" }],
  },
];
vi.mock("@/server/contexto", () => ({ obterContexto: async () => ({}) }));
vi.mock("@/server/clientes", () => ({ listarClientes: async () => clientes }));

describe("exportar clientes (CSV e XLSX)", () => {
  it("gerarXlsx: aba nomeada, cabeçalho na linha 1, números como número", () => {
    const wb = XLSX.read(gerarXlsx(["Nome", "Valor"], [["Ana", 12.5], ["Bia", null]], "Clientes"));
    expect(wb.SheetNames).toEqual(["Clientes"]);
    expect(XLSX.utils.sheet_to_json(wb.Sheets.Clientes!, { header: 1 })).toEqual([["Nome", "Valor"], ["Ana", 12.5], ["Bia", ""]]);
  });

  it("rota devolve CSV (padrão, com BOM) e XLSX com as mesmas colunas e o CNPJ/CEP formatados", async () => {
    const { GET } = await import("@/app/api/clientes/exportar/route");
    const req = (q: string) => ({ nextUrl: new URL(`http://x/api/clientes/exportar${q}`) }) as never;

    const csv = await GET(req(""));
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.headers.get("content-disposition")).toMatch(/clientes-\d{4}-\d{2}-\d{2}\.csv/);
    const bytes = new Uint8Array(await csv.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8: acentos certos no Excel
    const texto = new TextDecoder().decode(bytes);
    expect(texto.split("\r\n")[1]).toBe('Loja São João;11.222.333/0001-81;a@a.com;;62999998888;Goiânia;GO;74000-000;Varejo;Alfa, Beta;Ativo;"Paga em dia; cliente antigo";01/10/2026');

    const xlsx = await GET(req("?formato=xlsx"));
    expect(xlsx.headers.get("content-disposition")).toMatch(/\.xlsx"/);
    const wb = XLSX.read(new Uint8Array(await xlsx.arrayBuffer()));
    const m = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Clientes!, { header: 1 });
    expect(m[0]).toEqual(["Nome", "CNPJ/CPF", "E-mail", "Celular", "WhatsApp", "Cidade", "UF", "CEP", "Segmento", "Representadas", "Status", "Anotações", "Cadastrado em"]);
    expect(m[1]![1]).toBe("11.222.333/0001-81");
    expect(m[1]![9]).toBe("Alfa, Beta");
  });
});
