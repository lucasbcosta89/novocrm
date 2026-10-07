import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { dentroDaJanela, linkWhatsApp, normalizarTelefone, renderizarTemplate } from "@/lib/whatsapp";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({}) }));
const { pedidoPublicoSchema } = await import("@/server/catalogo-publico");
const { pushSchema } = await import("@/server/sync");
const { assinaturaMetaValida } = await import("@/server/whatsapp");

const ID = "11111111-1111-4111-8111-111111111111";

describe("WhatsApp utilitários", () => {
  it("normaliza telefone BR para E.164 sem +", () => {
    expect(normalizarTelefone("(11) 99999-8888")).toBe("5511999998888");
    expect(normalizarTelefone("+55 62 3333-4444")).toBe("556233334444");
    expect(normalizarTelefone("123")).toBeNull();
  });
  it("renderiza template e gera link wa.me", () => {
    const t = renderizarTemplate("Olá {{1}}! Catálogo da {{2}}: {{3}}", ["Ana", "Alfa", "https://x/c/alfa"]);
    expect(t).toBe("Olá Ana! Catálogo da Alfa: https://x/c/alfa");
    expect(linkWhatsApp("5511999998888", "Olá Ana")).toBe("https://wa.me/5511999998888?text=Ol%C3%A1%20Ana");
  });
  it("janela de 24h para mensagem livre", () => {
    const agora = new Date("2026-10-07T12:00:00Z");
    expect(dentroDaJanela("2026-10-06T13:00:00Z", agora)).toBe(true);
    expect(dentroDaJanela("2026-10-06T11:59:00Z", agora)).toBe(false);
    expect(dentroDaJanela(null, agora)).toBe(false);
  });
  it("valida X-Hub-Signature-256 da Meta", async () => {
    process.env.WHATSAPP_APP_SECRET = "app-secret";
    const corpo = '{"entry":[]}';
    const sig = "sha256=" + createHmac("sha256", "app-secret").update(corpo).digest("hex");
    expect(await assinaturaMetaValida(corpo, sig)).toBe(true);
    expect(await assinaturaMetaValida(corpo + " ", sig)).toBe(false);
    expect(await assinaturaMetaValida(corpo, null)).toBe(false);
  });
});

describe("pedido público", () => {
  const base = { slug: "alfa", cliente: { nome: "Loja X", whatsapp: "(11) 99999-8888" }, itens: [{ produto_id: ID, quantidade: 2 }] };
  it("aceita pedido válido", () => {
    expect(pedidoPublicoSchema.safeParse(base).success).toBe(true);
  });
  it("rejeita WhatsApp inválido, carrinho vazio e robô (honeypot)", () => {
    expect(pedidoPublicoSchema.safeParse({ ...base, cliente: { ...base.cliente, whatsapp: "99" } }).success).toBe(false);
    expect(pedidoPublicoSchema.safeParse({ ...base, itens: [] }).success).toBe(false);
    expect(pedidoPublicoSchema.safeParse({ ...base, site: "spam" }).success).toBe(false);
  });
});

describe("sync push", () => {
  it("exige UUID do cliente e updated_at ISO; normaliza dados", () => {
    const p = pushSchema.parse({
      visitas: [{ id: ID, cliente_id: ID, data: "2026-10-07T09:30", tipo: "presencial", updated_at: "2026-10-07T12:30:00.000Z" }],
    });
    expect(p.visitas[0]).toMatchObject({ data: "2026-10-07T09:30:00-03:00", tipo: "presencial" });
    expect(p.clientes).toEqual([]);
    expect(pushSchema.safeParse({ visitas: [{ id: "x", cliente_id: ID, data: "2026-10-07T09:30", updated_at: "ontem" }] }).success).toBe(false);
  });
});
