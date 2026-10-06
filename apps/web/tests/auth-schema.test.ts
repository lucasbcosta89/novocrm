import { describe, expect, it } from "vitest";
import { loginSchema, primeiroErro, signupSchema } from "@/lib/auth-schema";

describe("auth schemas", () => {
  it("normaliza e-mail e aceita login válido", () => {
    const r = loginSchema.parse({ email: "  Rep@Exemplo.com ", senha: "12345678" });
    expect(r.email).toBe("rep@exemplo.com");
  });

  it("rejeita senha curta", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", senha: "123" });
    expect(r.success).toBe(false);
    if (!r.success) expect(primeiroErro(r.error)).toMatch(/8 caracteres/);
  });

  it("exige nome no signup", () => {
    expect(signupSchema.safeParse({ email: "a@b.com", senha: "12345678", nome: "" }).success).toBe(false);
    expect(signupSchema.safeParse({ email: "a@b.com", senha: "12345678", nome: "Ana" }).success).toBe(true);
  });
});
