import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({}) }));
const { limitesPeriodo, positivacao, pdfMensal, pdfCatalogo } = await import("@/server/relatorios");
const { solicitacaoSchema } = await import("@/server/documentos");

const REP = { id: "11111111-1111-4111-8111-111111111111", nome: "Representada A", cnpj: "12345678000190" };
const CLI = "22222222-2222-4222-8222-222222222222";
const asc = (b: Uint8Array) => new TextDecoder("latin1").decode(b.subarray(0, 5));

describe("período", () => {
  it("limites em horário de Brasília e virada de ano", () => {
    expect(limitesPeriodo("2026-10")).toMatchObject({ inicio: "2026-10-01T00:00:00-03:00", fim: "2026-11-01T00:00:00-03:00" });
    expect(limitesPeriodo("2026-12").fim).toBe("2027-01-01T00:00:00-03:00");
    expect(limitesPeriodo("2026-10").rotulo).toMatch(/outubro/);
  });
});

describe("positivação", () => {
  it("clientes distintos com pedido ÷ carteira", () => {
    const pedidos = [{ cliente_id: CLI }, { cliente_id: CLI }, { cliente_id: "x" }] as never;
    expect(positivacao({ pedidos, carteira: 4 })).toEqual({ positivados: 2, carteira: 4, percentual: 50 });
    expect(positivacao({ pedidos: [], carteira: 0 }).percentual).toBe(0);
  });
});

describe("solicitação", () => {
  it("valida tipo, período e 'todas' só no catálogo", () => {
    expect(solicitacaoSchema.safeParse({ tipo: "relatorio_periodo", representada_id: REP.id, periodo: "2026-10" }).success).toBe(true);
    expect(solicitacaoSchema.safeParse({ tipo: "relatorio_periodo", representada_id: REP.id, periodo: "10/2026" }).success).toBe(false);
    expect(solicitacaoSchema.safeParse({ tipo: "catalogo", representada_id: "todas" }).success).toBe(true);
    expect(solicitacaoSchema.safeParse({ tipo: "relatorio_comissao", representada_id: "todas", periodo: "2026-10" }).success).toBe(false);
  });
});

describe("geração com pdfmake", () => {
  it("relatório mensal gera PDF válido", async () => {
    const pdf = await pdfMensal({
      representada: REP,
      periodo: "2026-10",
      visitas: [{ data: "2026-10-06T17:30:00Z", tipo: "presencial", resultado: "Pedido fechado", cliente: { nome: "Loja X" } }],
      pedidos: [{ numero: "P000001", data: "2026-10-06T18:00:00Z", status: "confirmado", valor_total: 1000, comissao_total: 70, cliente_id: CLI, cliente: { nome: "Loja X" } }],
      comissoes: [{ valor: 70, status: "a_receber" }],
      carteira: 1,
    });
    expect(asc(pdf)).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(2000);
  });

  it("catálogo com várias marcas e categorias (sem imagem → placeholder)", async () => {
    const produto = (sku: string, categoria: string | null) => ({ sku, nome: `Produto ${sku}`, descricao: null, unidade: "un", categoria, imagem_url: null, preco: 10 });
    const pdf = await pdfCatalogo({
      marcas: [
        { representada: REP, produtos: [produto("A", "Escolar"), produto("B", "Escolar"), produto("C", null)] },
        { representada: { ...REP, id: "x", nome: "Representada B" }, produtos: [] },
      ],
    });
    expect(asc(pdf)).toBe("%PDF-");
  });
});
