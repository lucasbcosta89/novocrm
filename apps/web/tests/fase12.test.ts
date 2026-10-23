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

  it("fase 12b: link wa.me com DDI 55, mensagem com número e valor; sem telefone ou inválido = motivo", async () => {
    const { linkPedidoWhatsApp, mensagemPedido } = await import("@/lib/whatsapp");
    const ok = linkPedidoWhatsApp("(62) 99999-8888", "Maria Souza", "P000010", 6610);
    expect(ok).toMatchObject({ contato: "5562999998888" });
    const url = new URL((ok as { url: string }).url);
    expect(url.origin + url.pathname).toBe("https://wa.me/5562999998888");
    expect(url.searchParams.get("text")?.replace(/ /g, " ")).toBe("Olá, Maria Souza! Segue o pedido nº P000010, no valor de R$ 6.610,00. O PDF está em anexo.");
    expect(linkPedidoWhatsApp("55 62 3333-4444", "X", "1", 1)).toMatchObject({ contato: "556233334444" });
    expect(linkPedidoWhatsApp(null, "X", "1", 1)).toEqual({ motivo: "Cliente sem telefone cadastrado" });
    expect(linkPedidoWhatsApp("9999-8888", "X", "1", 1)).toEqual({ motivo: "Telefone do cliente inválido (use DDD + número)" });
    expect(mensagemPedido("Ana", "P1", 10.5).replace(/ /g, " ")).toContain("R$ 10,50");
  });
});
