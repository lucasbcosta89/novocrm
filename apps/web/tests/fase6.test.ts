import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { mesAtual } from "@/lib/planos";

vi.mock("server-only", () => ({}));
const { assinaturaValida } = await import("@/server/mercadopago");
const { limiteAtingido } = await import("@/server/quota");

const SEGREDO = "segredo-teste";
const assinar = (manifesto: string) => createHmac("sha256", SEGREDO).update(manifesto).digest("hex");

describe("webhook MP: x-signature", () => {
  const ts = "1704908010";
  const v1 = assinar(`id:123456;request-id:req-1;ts:${ts};`);

  it("aceita assinatura correta", async () => {
    expect(await assinaturaValida(SEGREDO, { xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "123456" })).toBe(true);
  });
  it("data.id alfanumérico entra em minúsculas", async () => {
    const v = assinar(`id:abc123;request-id:req-1;ts:${ts};`);
    expect(await assinaturaValida(SEGREDO, { xSignature: `ts=${ts},v1=${v}`, xRequestId: "req-1", dataId: "ABC123" })).toBe(true);
  });
  it("rejeita adulterada, sem segredo ou sem header", async () => {
    expect(await assinaturaValida(SEGREDO, { xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "999" })).toBe(false);
    expect(await assinaturaValida("", { xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "123456" })).toBe(false);
    expect(await assinaturaValida(SEGREDO, { xSignature: null, xRequestId: "req-1", dataId: "123456" })).toBe(false);
  });
});

describe("quota", () => {
  it("limiteAtingido: Solo com 1 representada não cria a 2ª", () => {
    expect(limiteAtingido(1, 1)).toBe(true);
    expect(limiteAtingido(3, 1)).toBe(false);
    expect(limiteAtingido(null, 999)).toBe(false);
  });
  it("mês da quota no fuso de Brasília", () => {
    expect(mesAtual(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10"); // 23h de 31/10 em Brasília
    expect(mesAtual(new Date("2026-11-01T03:00:00Z"))).toBe("2026-11");
  });
});
