import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => {} }));

// PNG 1x1 válido (a "foto" de dois produtos)
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const item = (sku: string, q: number, preco: number, desc: number, foto: string | null) => ({
  produto_id: sku, descricao: null, quantidade: q, preco_unitario: preco, desconto_percentual: desc,
  subtotal: Math.round(q * preco * (1 - desc / 100) * 100) / 100,
  produto: { sku, nome: `Produto ${sku}`, ncm: "12345678", imagem_url: foto },
});
const pedido = {
  id: "p", numero: "P000010", data: "2026-10-20T15:00:00Z", status: "confirmado", forma_pagamento: "pix", prazo_tipo: "a_prazo", prazo_dias: 30,
  cliente: { id: "c", nome: "Maria Souza", whatsapp: "62999998888", celular: null }, representada: { nome: "Marca A" },
  itens: [item("A", 2, 100, 0, "fotos/a.png"), item("B", 3, 50, 10, null), item("C", 1, 80, 0, "fotos/c.png")],
  valor_total: 0,
};
pedido.valor_total = pedido.itens.reduce((s, i) => s + i.subtotal, 0);

describe("PDF do pedido (fase 12)", () => {
  it("3 itens = 3 linhas; item sem foto com célula vazia; Desc. % só com desconto; TOTAL = valor_total", async () => {
    const { tabelaItensPedido } = await import("@/server/pdf-pedido");
    const fotos = new Map([["fotos/a.png", PNG], ["fotos/c.png", PNG]]);
    const { body, comDesconto } = tabelaItensPedido(pedido as never, fotos);
    expect(comDesconto).toBe(true);
    expect(body).toHaveLength(1 + 3 + 1);
    const texto = (c: unknown) => (c as { text?: string }).text?.replace(/ /g, " ");
    expect(body[0]!.map(texto)).toEqual(["Foto", "Código/SKU", "Produto", "NCM", "Qtd.", "Valor unit.", "Desc. %", "Valor total"]);
    expect((body[1]![0] as { image?: string }).image).toBe(PNG);
    expect(body[2]![0]).toEqual({ text: "" }); // sem foto: vazia, sem placeholder
    expect(body[2]!.slice(1).map(texto)).toEqual(["B", "Produto B", "12345678", "3", "R$ 50,00", "10%", "R$ 135,00"]);
    expect(texto(body[4]![0])).toBe("TOTAL DO PEDIDO");
    expect(texto(body[4]!.at(-1))).toBe("R$ 415,00");
    const semDesc = tabelaItensPedido({ itens: [pedido.itens[0]!], valor_total: 200 } as never, fotos);
    expect(semDesc.comDesconto).toBe(false);
    expect(semDesc.body[0]!.map(texto)).not.toContain("Desc. %");
  });

  it("gera o PDF no template (busca cada foto uma vez)", async () => {
    const leituras: string[] = [];
    vi.doMock("@/server/relatorios", () => ({ imagemDataUrl: async (k: string) => (leituras.push(k), PNG) }));
    vi.resetModules();
    const { pdfPedido } = await import("@/server/pdf-pedido");
    const dup = { ...pedido, itens: [...pedido.itens, item("A2", 1, 10, 0, "fotos/a.png")] };
    const pdf = await pdfPedido(dup as never, { nome: "Ana Rep", nome_empresa: null, cnpj: null });
    expect(String.fromCharCode(...pdf.slice(0, 5))).toBe("%PDF-");
    expect(leituras.sort()).toEqual(["fotos/a.png", "fotos/c.png"]);
    vi.doUnmock("@/server/relatorios");
  });

  it("erros da Cloud API viram mensagens claras; link público assinado expira", async () => {
    process.env.DADOS_PESSOAIS_CHAVE = "teste";
    vi.resetModules();
    const m = await import("@/server/pedido-whatsapp");
    expect(m.mensagemErroMeta(131026, "x")).toMatch(/Número sem WhatsApp/);
    expect(m.mensagemErroMeta(131047, "x")).toMatch(/janela de 24h/);
    expect(m.mensagemErroMeta(132001, "x")).toMatch(/Template inexistente/);
    expect(m.mensagemErroMeta(131053, "x")).toMatch(/rejeitou o PDF/);
    const agora = Date.now();
    const url = new URL(await m.linkPublicoDocumento("https://x.dev", "doc-1", agora));
    expect(await m.linkPublicoValido("doc-1", url.searchParams.get("exp"), url.searchParams.get("sig"), agora)).toBe(true);
    expect(await m.linkPublicoValido("doc-2", url.searchParams.get("exp"), url.searchParams.get("sig"), agora)).toBe(false);
    expect(await m.linkPublicoValido("doc-1", url.searchParams.get("exp"), url.searchParams.get("sig"), agora + 8 * 86_400_000)).toBe(false);
  });
});
