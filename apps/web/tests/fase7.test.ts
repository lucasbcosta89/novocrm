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
    expect(limitesPeriodo("2026-10").rotulo).toBe("Outubro/2026");
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
  it("valida tipo e período; relatórios aceitam 'todas' (gerais); catálogo geral é tipo próprio (Fase 7c)", () => {
    expect(solicitacaoSchema.safeParse({ tipo: "relatorio_periodo", representada_id: REP.id, periodo: "2026-10" }).success).toBe(true);
    expect(solicitacaoSchema.safeParse({ tipo: "relatorio_periodo", representada_id: REP.id, periodo: "10/2026" }).success).toBe(false);
    expect(solicitacaoSchema.safeParse({ tipo: "relatorio_comissao", representada_id: "todas", periodo: "2026-10" }).success).toBe(true);
    expect(solicitacaoSchema.safeParse({ tipo: "catalogo_geral" }).success).toBe(true);
    expect(solicitacaoSchema.safeParse({ tipo: "catalogo", representada_id: "todas" }).success).toBe(false);
  });

  it("relatórios gerais: uma seção por representada + totais gerais", async () => {
    const { pdfMensalGeral, pdfComissoesGeral } = await import("@/server/relatorios");
    const mensal = (nome: string) => ({ representada: { ...REP, nome }, periodo: "2026-10", visitas: [], pedidos: [], comissoes: [{ valor: 70, status: "a_receber" }], carteira: 1 });
    expect(asc(await pdfMensalGeral([mensal("A"), mensal("B")], "2026-10"))).toBe("%PDF-");
    expect(asc(await pdfComissoesGeral([{ representada: REP, periodo: "2026-10", comissoes: [] }], "2026-10"))).toBe("%PDF-");
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

describe("imagem", () => {
  it("detecta formato pelos bytes (WebP renomeado não passa como JPEG)", async () => {
    const { detectarTipoImagem } = await import("@/lib/imagem");
    expect(detectarTipoImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectarTipoImagem(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("image/png");
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0xf6, 0x11, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectarTipoImagem(webp)).toBe("image/webp");
    expect(detectarTipoImagem(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("Fase 7b: template padrão", () => {
  it("logo embutida é PNG pequeno em base64 (sem URL externa)", async () => {
    const { LOGO_FEITO_COM } = await import("@/conteudo/logo-feito-com.gerado");
    expect(LOGO_FEITO_COM.startsWith("data:image/png;base64,iVBOR")).toBe(true);
    expect(LOGO_FEITO_COM.length).toBeLessThan(100_000);
  });

  it("comissões e catálogo geram PDF com o cabeçalho do representante (com e sem empresa/CNPJ)", async () => {
    const { pdfComissoes } = await import("@/server/relatorios");
    const completo = { nome: "Ana Rep", nome_empresa: "Ana Representações", cnpj: "11222333000181" };
    const so_nome = { nome: "Ana Rep", nome_empresa: null, cnpj: null };
    const dados = { representada: REP, periodo: "2026-10", comissoes: [] };
    expect(asc(await pdfComissoes(dados, completo))).toBe("%PDF-");
    expect(asc(await pdfComissoes(dados, so_nome))).toBe("%PDF-");
    expect(asc(await pdfCatalogo({ marcas: [{ representada: REP, produtos: [] }] }, completo))).toBe("%PDF-");
  });
});
