import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { filtroPedidosSchema, limitesPeriodoPedidos, urlPedidos } from "@/lib/filtro-pedidos";

vi.mock("server-only", () => ({}));
const CLI = "11111111-1111-4111-8111-111111111111";
const recebido: unknown[] = [];
vi.mock("@/server/contexto", () => ({ obterContexto: async () => ({}) }));
vi.mock("@/server/consultas", () => ({
  listarPedidosFiltrados: async (_ctx: unknown, entrada: unknown, opcoes: unknown) => {
    recebido.push([entrada, opcoes]);
    return {
      pedidos: [{
        id: "p", numero: "P000012", codigo_pedido: "1001", tem_pendencias: true, data: "2026-10-20T15:00:00Z", status: "confirmado",
        valor_total: 686.03, comissao_total: 37.73, cliente: { id: CLI, nome: "Loja São João" }, representada: { id: "r", nome: "Alfa" },
      }],
      filtro: {}, limitado: false,
    };
  },
}));

describe("página Pedidos: filtros por código, cliente e período + exportação", () => {
  it("filtro da URL: datas válidas, cliente uuid, período invertido é corrigido, lixo vira vazio", () => {
    expect(filtroPedidosSchema.parse({})).toEqual({ q: "", cliente: null, de: null, ate: null });
    expect(filtroPedidosSchema.parse({ q: " 1001 ", cliente: CLI, de: "2026-10-01", ate: "2026-10-31" }))
      .toEqual({ q: "1001", cliente: CLI, de: "2026-10-01", ate: "2026-10-31" });
    expect(filtroPedidosSchema.parse({ de: "2026-10-31", ate: "2026-10-01" })).toMatchObject({ de: "2026-10-01", ate: "2026-10-31" });
    expect(filtroPedidosSchema.parse({ cliente: "x", de: "31/10/2026" })).toMatchObject({ cliente: null, de: null });
  });

  it("período no fuso de Brasília: inclui o dia inteiro de 'até'", () => {
    expect(limitesPeriodoPedidos({ de: "2026-10-01", ate: "2026-10-31" })).toEqual({ desde: "2026-10-01T00:00:00-03:00", antes: "2026-11-01T00:00:00-03:00" });
    expect(limitesPeriodoPedidos({ de: null, ate: null })).toEqual({ desde: null, antes: null });
  });

  it("exportação usa os mesmos filtros da tela", () => {
    const f = filtroPedidosSchema.parse({ q: "10", cliente: CLI, de: "2026-10-01" });
    expect(urlPedidos(f, "/api/pedidos/exportar", { formato: "xlsx" })).toBe(`/api/pedidos/exportar?q=10&cliente=${CLI}&de=2026-10-01&formato=xlsx`);
    expect(urlPedidos(filtroPedidosSchema.parse({}), "/app/pedidos")).toBe("/app/pedidos");
  });

  it("rota exporta CSV e XLSX (até 5.000) com valores como número no XLSX", async () => {
    const { GET } = await import("@/app/api/pedidos/exportar/route");
    const req = (q: string) => ({ nextUrl: new URL(`http://x/api/pedidos/exportar${q}`) }) as never;
    const csv = await GET(req(`?cliente=${CLI}&formato=csv`));
    const linha = new TextDecoder().decode(new Uint8Array(await csv.arrayBuffer())).split("\r\n")[1];
    expect(linha).toBe("1001;P000012;20/10/2026;Loja São João;Alfa;Confirmado;686,03;37,73;Sim");
    const xlsx = await GET(req(`?cliente=${CLI}&formato=xlsx`));
    const m = XLSX.utils.sheet_to_json<unknown[]>(XLSX.read(new Uint8Array(await xlsx.arrayBuffer())).Sheets.Pedidos!, { header: 1 });
    expect(m[0]).toEqual(["Código", "Nº interno", "Data", "Cliente", "Representada", "Status", "Valor total (R$)", "Comissão (R$)", "Pendências"]);
    expect(m[1]![6]).toBe(686.03);
    expect(recebido[0]).toEqual([{ cliente: CLI, formato: "csv" }, { limite: 5000 }]);
  });
});
