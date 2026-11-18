import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buscarSecao, SECOES } from "@/lib/navegacao";
import { lerReferenciaAvulso, referenciaAvulso } from "@/server/assinaturas";
import { calcularAcesso, diasAte, economia, FORMAS, ORDEM_FORMAS, PLANO } from "@/lib/planos";

vi.mock("server-only", () => ({}));

describe("plano único — 4 formas de pagamento", () => {
  it("preços: cartão R$ 129,90/mês recorrente; anual 12x R$ 109,90; Pix R$ 109,90 e R$ 1.078,80", () => {
    expect(FORMAS.cartao_mensal).toMatchObject({ cobranca: 129.9, meses: 1, recorrente: true });
    expect(FORMAS.cartao_anual).toMatchObject({ valorMensal: 109.9, cobranca: 1318.8, parcelas: 12, meses: 12, recorrente: false });
    expect(FORMAS.pix_mensal).toMatchObject({ cobranca: 109.9, meses: 1, recorrente: false });
    expect(FORMAS.pix_anual).toMatchObject({ valorMensal: 89.9, cobranca: 1078.8, meses: 12, recorrente: false });
    for (const forma of ORDEM_FORMAS) {
      const fo = FORMAS[forma];
      expect(Math.round(fo.valorMensal * fo.meses * 100) / 100, forma).toBe(fo.cobranca);
    }
    expect(economia("pix_anual")).toBe(31);
  });

  it("sem limites de representadas/clientes/PDFs; WhatsApp com teto de uso justo", () => {
    expect(PLANO.limites).toEqual({ representadas: null, clientes: null, oportunidades: null, pdf_mes: null, conversas_mes: 1500 });
  });

  it("schema.sql: linha 'plurima' com os limites de PLANO e preço do cartão mensal", () => {
    const sql = readFileSync(path.resolve(__dirname, "../../../schema.sql"), "utf8");
    const m = sql.match(/values \('plurima', 'Plurima', [\d.]+, '(\{.*\})'\)/);
    expect(JSON.parse(m![1]!)).toEqual(PLANO.limites);
    const precos = [...sql.matchAll(/update planos set preco = ([\d.]+) where codigo = 'plurima'/g)];
    expect(Number(precos.at(-1)![1])).toBe(FORMAS.cartao_mensal.cobranca);
    // valores mínimos aceitos pelo banco = preços do app
    expect(sql).toContain("when 'cartao_anual' then 1318.80 when 'pix_anual' then 1078.80 when 'pix_mensal' then 109.90");
  });

  it("referência dos pagamentos únicos: só usuário válido e forma avulsa", () => {
    const u = "0b2c7c1e-1111-4a2b-9c3d-123456789abc";
    expect(lerReferenciaAvulso(referenciaAvulso(u, "pix_anual"))).toEqual({ userId: u, forma: "pix_anual" });
    expect(lerReferenciaAvulso(`avulso:${u}:cartao_mensal`)).toBeNull(); // recorrente não é avulso
    expect(lerReferenciaAvulso("avulso:xpto:pix_mensal")).toBeNull();
    expect(lerReferenciaAvulso(`user_${u}`)).toBeNull();
    expect(lerReferenciaAvulso(null)).toBeNull();
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
