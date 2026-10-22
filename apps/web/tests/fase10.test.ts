import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => {} }));

const asc = (b: Uint8Array) => String.fromCharCode(...b.slice(0, 5));
const ped = (data: string, valor: number, cli = "c1", rep = "r1") => ({
  id: `${data}-${valor}`, numero: "P1", data, valor_total: valor, cliente: { id: cli, nome: `Cliente ${cli}` }, representada: { id: rep, nome: `Rep ${rep}` },
  itens: [{ quantidade: 2, preco_unitario: valor / 2, desconto_percentual: 0, subtotal: valor, descricao: "Produto", produto: { sku: "A", nome: "Produto A" } }],
});

describe("biblioteca (fase 10)", () => {
  it("período: mês ou intervalo, e o período anterior equivalente", async () => {
    const { limitesPeriodo, periodoAnterior } = await import("@/server/relatorios");
    expect(limitesPeriodo("2026-10")).toMatchObject({ inicio: "2026-10-01T00:00:00-03:00", fim: "2026-11-01T00:00:00-03:00" });
    expect(limitesPeriodo("2026-09-01_2026-09-30")).toEqual({ inicio: "2026-09-01T00:00:00-03:00", fim: "2026-10-01T00:00:00-03:00", rotulo: "01/09/2026 a 30/09/2026" });
    expect(periodoAnterior("2026-01")).toBe("2025-12");
    expect(periodoAnterior("2026-09-11_2026-09-20")).toBe("2026-09-01_2026-09-10");
    const { periodoSchema } = await import("@/server/documentos");
    expect(periodoSchema.safeParse("2026-10").success).toBe(true);
    expect(periodoSchema.safeParse("2026-10-10_2026-10-01").success).toBe(false);
    expect(periodoSchema.safeParse("2025-01-01_2026-06-01").success).toBe(false);
  });

  it("KPIs: ticket médio, % oportunidades convertidas e % clientes convertidos ('—' sem funil de prospecção)", async () => {
    const { calcularKpis } = await import("@/server/relatorios-biblioteca");
    const pedidos = [ped("2026-10-05T15:00:00Z", 100), ped("2026-10-20T15:00:00Z", 300), ped("2026-09-20T15:00:00Z", 50)] as never;
    const ops = [
      { resultado: "ganhou", data_conclusao: "2026-10-10T12:00:00Z", criado_em: "2026-10-01T12:00:00Z", funil: { modelo: "prospeccao" } },
      { resultado: "perdeu", data_conclusao: "2026-10-11T12:00:00Z", criado_em: "2026-10-02T12:00:00Z", funil: { modelo: "vendas" } },
      { resultado: null, data_conclusao: null, criado_em: "2026-10-03T12:00:00Z", funil: { modelo: "prospeccao" } },
    ];
    const k = calcularKpis(pedidos, ops, "2026-10", true);
    expect(k.vendas).toEqual({ total: 400, pedidos: 2, ticket: 200 });
    expect(k.oportunidades).toBe(50);
    expect(k.clientes).toBe(50);
    expect(calcularKpis(pedidos, ops, "2026-10", false).clientes).toBeNull();
  });

  it("PDFs da biblioteca usam o template (vendas geral/cliente/representada e KPIs)", async () => {
    const m = await import("@/server/relatorios-biblioteca");
    const rep = { nome: "Ana Rep", nome_empresa: "Ana Representações", cnpj: "11222333000181" };
    const pedidos = [ped("2026-10-05T15:00:00Z", 100), ped("2026-10-06T15:00:00Z", 50, "c2", "r2")] as never;
    expect(asc(await m.pdfVendasGeral({ periodo: "2026-10", pedidos }, rep))).toBe("%PDF-");
    expect(asc(await m.pdfVendasCliente({ periodo: "2026-10", cliente: { id: "c1", nome: "Cliente" }, pedidos }, rep))).toBe("%PDF-");
    expect(asc(await m.pdfVendasRepresentada({ periodo: "2026-10", representada: { id: "r1", nome: "Rep", cnpj: null }, pedidos }, rep))).toBe("%PDF-");
    const k = m.calcularKpis(pedidos, [], "2026-10", false);
    expect(asc(await m.pdfKpis({ periodo: "2026-10", anterior: "2026-09", temProspeccao: false, atual: k, ant: k }, rep))).toBe("%PDF-");
  });
});
