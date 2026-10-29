import { describe, expect, it, vi } from "vitest";
import { edicaoPedidoSchema, pedidoSchema } from "@/lib/validacao";
import { padraoBusca } from "@/server/consultas";
vi.mock("server-only", () => ({}));

const ID = "11111111-1111-4111-8111-111111111111";
const base = { representada_id: ID, cliente_id: ID, itens: [{ produto_id: ID, quantidade: 1 }] };

describe("fase 14 — código do pedido", () => {
  it("gerar marcado (padrão): código digitado é descartado, o servidor grava o gerado", () => {
    expect(pedidoSchema.parse(base).codigo_pedido).toBeNull();
    expect(pedidoSchema.parse({ ...base, gerar_codigo: true, codigo_pedido: "ERP-1" }).codigo_pedido).toBeNull();
  });

  it("gerar desmarcado: código obrigatório (vazio bloqueado), com trim e máx. 40", () => {
    const vazio = pedidoSchema.safeParse({ ...base, gerar_codigo: false, codigo_pedido: "   " });
    expect(vazio.success).toBe(false);
    expect(vazio.error?.issues[0]?.message).toBe("Informe o código do pedido");
    expect(pedidoSchema.parse({ ...base, gerar_codigo: false, codigo_pedido: "  ERP-123 " }).codigo_pedido).toBe("ERP-123");
    expect(pedidoSchema.safeParse({ ...base, gerar_codigo: false, codigo_pedido: "x".repeat(41) }).success).toBe(false);
  });

  it("edição: código opcional (ausente = mantém)", () => {
    const itens = [{ produto_id: ID, quantidade: 1, preco_unitario: 10 }];
    expect(edicaoPedidoSchema.parse({ itens }).codigo_pedido).toBeUndefined();
    expect(edicaoPedidoSchema.parse({ itens, codigo_pedido: " ERP-9 " }).codigo_pedido).toBe("ERP-9");
  });

  it("busca: termo vira padrão ilike literal (curingas escapados); vazio = sem filtro", () => {
    expect(padraoBusca("erp-1")).toBe("%erp-1%");
    expect(padraoBusca("50%_a\\b")).toBe("%50\\%\\_a\\\\b%");
    expect(padraoBusca("  ")).toBeNull();
    expect(padraoBusca(null)).toBeNull();
  });

  it("PDF do pedido usa o codigo_pedido no título e no cabeçalho", async () => {
    const chamadas: { conteudo: unknown; titulo: string }[] = [];
    vi.doMock("@/server/relatorios", () => ({ imagemDataUrl: async () => null }));
    vi.doMock("@/lib/pdf", async (orig) => {
      const real = await orig<typeof import("@/lib/pdf")>();
      return { ...real, gerarPdf: async (conteudo: unknown, opts: { titulo: string }) => (chamadas.push({ conteudo, titulo: opts.titulo }), new Uint8Array()) };
    });
    vi.resetModules();
    const { pdfPedido } = await import("@/server/pdf-pedido");
    const pedido = {
      id: "p", numero: "P000003", codigo_pedido: "ERP-777", data: "2026-10-20T15:00:00Z", status: "confirmado", valor_total: 10,
      forma_pagamento: null, prazo_tipo: "a_vista", prazo_dias: null, cliente: { id: "c", nome: "Loja", whatsapp: null, celular: null },
      representada: { nome: "Rep" },
      itens: [{ produto_id: "a", descricao: null, quantidade: 1, preco_unitario: 10, desconto_percentual: 0, subtotal: 10, produto: { sku: "A", nome: "A", ncm: null, imagem_url: null } }],
    };
    await pdfPedido(pedido as never, { nome: "Ana", nome_empresa: null, cnpj: null });
    expect(chamadas[0]?.titulo).toBe("Pedido ERP-777");
    const conteudo = JSON.stringify(chamadas[0]?.conteudo);
    expect(conteudo).toContain("Pedido nº ERP-777 — Loja");
    expect(conteudo).not.toContain("P000003");
    vi.doUnmock("@/server/relatorios");
    vi.doUnmock("@/lib/pdf");
  });
});
