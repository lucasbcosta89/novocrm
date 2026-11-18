import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buscarSecao, SECOES } from "@/lib/navegacao";
import { calcularAcesso, CICLOS, diasAte, ECONOMIA_ANUAL, PLANO } from "@/lib/planos";

describe("plano único", () => {
  it("preços: R$ 119,90 mensal; anual R$ 99,90/mês cobrado de uma vez (R$ 1.198,80)", () => {
    expect(CICLOS.mensal).toMatchObject({ cobranca: 119.9, meses: 1 });
    expect(CICLOS.anual).toMatchObject({ valorMensal: 99.9, cobranca: 1198.8, meses: 12 });
    expect(ECONOMIA_ANUAL).toBe(17);
  });

  it("sem limites de representadas/clientes/PDFs; WhatsApp com teto de uso justo", () => {
    expect(PLANO.limites).toEqual({ representadas: null, clientes: null, oportunidades: null, pdf_mes: null, conversas_mes: 1500 });
  });

  it("schema.sql cria a linha 'plurima' espelhando PLANO", () => {
    const sql = readFileSync(path.resolve(__dirname, "../../../schema.sql"), "utf8");
    const m = sql.match(/values \('plurima', 'Plurima', ([\d.]+), '(\{.*\})'\)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBe(CICLOS.mensal.cobranca);
    expect(JSON.parse(m![2]!)).toEqual(PLANO.limites);
  });
});

describe("paywall (espelho de acesso_usuario)", () => {
  const agora = new Date("2026-11-20T12:00:00Z");
  const em = (dias: number) => new Date(agora.getTime() + dias * 86_400_000).toISOString();

  it("trial vigente → trial; vencido sem assinatura → leitura", () => {
    expect(calcularAcesso({ trial_fim: em(3), assinatura: null }, agora)).toBe("trial");
    expect(calcularAcesso({ trial_fim: em(-1), assinatura: null }, agora)).toBe("leitura");
    expect(calcularAcesso({ trial_fim: em(-1), assinatura: { status: "pending", periodo_fim: null } }, agora)).toBe("leitura");
  });

  it("assinatura paga → assinante; vencida há < 7 dias → carência; depois → leitura", () => {
    expect(calcularAcesso({ trial_fim: em(-30), assinatura: { status: "active", periodo_fim: em(10) } }, agora)).toBe("assinante");
    expect(calcularAcesso({ trial_fim: em(-30), assinatura: { status: "active", periodo_fim: em(-3) } }, agora)).toBe("carencia");
    expect(calcularAcesso({ trial_fim: em(-30), assinatura: { status: "active", periodo_fim: em(-8) } }, agora)).toBe("leitura");
    // cancelada mantém o acesso até o fim do período já pago
    expect(calcularAcesso({ trial_fim: em(-30), assinatura: { status: "cancelled", periodo_fim: em(5) } }, agora)).toBe("assinante");
  });

  it("dias restantes arredondam para cima e nunca ficam negativos", () => {
    expect(diasAte(em(2.2), agora)).toBe(3);
    expect(diasAte(em(-1), agora)).toBe(0);
    expect(diasAte(null, agora)).toBe(0);
  });
});

describe("navegação", () => {
  it("sidebar tem as 10 seções na ordem (Calendário 4e; Biblioteca 10; Controle de Custos 11; Análises; Pedidos 17)", () => {
    expect(SECOES.map((s) => s.titulo)).toEqual([
      "Representadas", "Clientes", "Pedidos", "Oportunidades", "Calendário", "Comissões", "Controle de Custos", "Análises", "Biblioteca", "Configurar",
    ]);
    expect(buscarSecao("clientes")?.titulo).toBe("Clientes");
    expect(buscarSecao("xpto")).toBeUndefined();
  });
});
