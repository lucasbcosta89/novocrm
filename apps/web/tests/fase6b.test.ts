import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { cnpjValido, cpfValido, mascaraCnpj, mascaraCpf, ocultarCnpj, ocultarCpf } from "@/lib/documentos-br";
import { UFS } from "@/lib/ufs";
import { POLITICA_MD, VERSAO_POLITICA } from "@/conteudo/politica-privacidade.gerado";

vi.mock("server-only", () => ({}));
const { perfilSchema, aceitesSchema } = await import("@/server/perfil");

describe("CPF/CNPJ", () => {
  it("valida dígitos verificadores", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("123.456.789-00")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.222.333/0001-00")).toBe(false);
  });
  it("máscaras de digitação e ocultação", () => {
    expect(mascaraCpf("52998224725")).toBe("529.982.247-25");
    expect(mascaraCpf("5299")).toBe("529.9");
    expect(mascaraCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(ocultarCpf("52998224725")).toBe("529.982.247-**");
    expect(ocultarCnpj("11222333000181")).toBe("11.222.333/0001-**");
    expect(ocultarCpf(null)).toBeNull();
  });
});

describe("cadastro", () => {
  const base = { nome: "Ana", cpf: "529.982.247-25", rua: "Rua A", numero: "S/N", municipio: "Goiânia", estado: "GO" };
  it("exige CPF válido, aceita número em texto e CNPJ opcional", () => {
    expect(perfilSchema.safeParse(base).success).toBe(true);
    expect(perfilSchema.safeParse({ ...base, numero: "123-A", cnpj: "" }).success).toBe(true);
    expect(perfilSchema.safeParse({ ...base, cpf: "123.456.789-00" }).success).toBe(false);
    expect(perfilSchema.safeParse({ ...base, cnpj: "11.222.333/0001-00" }).success).toBe(false);
    expect(perfilSchema.safeParse({ ...base, estado: "XX" }).success).toBe(false);
  });
  it("exige os 2 aceites", () => {
    expect(aceitesSchema.safeParse({ aceite_lgpd: "on", aceite_politica: "on" }).success).toBe(true);
    expect(aceitesSchema.safeParse({ aceite_lgpd: "on" }).success).toBe(false);
  });
  it("27 UFs", () => {
    expect(UFS).toHaveLength(27);
  });
});

describe("política de privacidade", () => {
  it("conteúdo gerado está em dia com docs/politica-privacidade.md (rode pnpm gerar:politica)", () => {
    const md = readFileSync(path.resolve(__dirname, "../../../docs/politica-privacidade.md"), "utf8").replace(/\r\n/g, "\n");
    expect(md).toContain(`<!-- versao: ${VERSAO_POLITICA} -->`);
    expect(md.replace(/<!--[\s\S]*?-->\n?/, "")).toBe(POLITICA_MD);
  });
});
