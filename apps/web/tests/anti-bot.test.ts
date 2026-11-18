import { afterEach, describe, expect, it, vi } from "vitest";
import { CAMPO_HONEYPOT, emailDescartavel, verificarHumano } from "@/lib/anti-bot";

const form = (campos: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
};

describe("anti-bot", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("honeypot preenchido é recusado; vazio passa sem Turnstile configurado", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verificarHumano(form({ [CAMPO_HONEYPOT]: "http://spam" }), null)).toMatch(/Não foi possível/);
    expect(await verificarHumano(form({ [CAMPO_HONEYPOT]: "" }), null)).toBeNull();
  });

  it("com Turnstile: exige token e confere no siteverify", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "s");
    vi.stubEnv("TURNSTILE_SITE_KEY", "k");
    expect(await verificarHumano(form({}), null)).toMatch(/robô/);
    const ok = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    expect(await verificarHumano(form({ "cf-turnstile-response": "t" }), "1.2.3.4", ok as unknown as typeof fetch)).toBeNull();
    const falha = vi.fn(async () => new Response(JSON.stringify({ success: false })));
    expect(await verificarHumano(form({ "cf-turnstile-response": "t" }), null, falha as unknown as typeof fetch)).toMatch(/falhou/);
  });

  it("e-mails descartáveis", () => {
    expect(emailDescartavel("x@Mailinator.com")).toBe(true);
    expect(emailDescartavel("x@gmail.com")).toBe(false);
  });
});
