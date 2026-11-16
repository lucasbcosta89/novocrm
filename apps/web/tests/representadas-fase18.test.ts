import { describe, expect, it } from "vitest";
import {
  MSG_DIAS_COMISSAO, representadaFormSchema, representadaParcialSchema, rotuloPagamentoComissao, validarCampoRepresentada,
  validarRepresentada, valoresDaRepresentada, VALORES_VAZIOS_REPRESENTADA,
} from "@/lib/cadastros/representada";
import { ORDENACOES, filtroRepresentadasSchema } from "@/lib/cadastros/listagem-representadas";

const valida = {
  ...VALORES_VAZIOS_REPRESENTADA,
  razao_social: "Alfa Ltda", cnpj: "11.222.333/0001-81", email_comercial: "vendas@alfa.com.br", cidade: "Goiânia", uf: "GO",
};

describe("pagamento da comissão (fase 18)", () => {
  it("padrão 'No faturamento' sem referência nem dias", () => {
    expect(VALORES_VAZIOS_REPRESENTADA.comissao_pagamento_tipo).toBe("faturamento");
    expect(validarRepresentada(valida)).toEqual({});
    expect(representadaFormSchema.parse({ ...valida, comissao_pagamento_tipo: "" })).toMatchObject({
      comissao_pagamento_tipo: "faturamento", comissao_pagamento_referencia: null, comissao_pagamento_dias: null,
    });
  });

  it("dias: inteiro de 1 a 365 (rejeita 0, 366 e 12,5)", () => {
    for (const v of ["0", "366", "12,5", "12.5", "-3", "abc"]) expect(validarCampoRepresentada("comissao_pagamento_dias", v)).toBe(MSG_DIAS_COMISSAO);
    expect(validarCampoRepresentada("comissao_pagamento_dias", "1")).toBeNull();
    expect(validarCampoRepresentada("comissao_pagamento_dias", "365")).toBeNull();
  });

  it("'Outro' exige referência e dias", () => {
    const outro = { ...valida, comissao_pagamento_tipo: "outro" };
    expect(validarRepresentada(outro)).toEqual({ comissao_pagamento_referencia: "Selecione a referência.", comissao_pagamento_dias: MSG_DIAS_COMISSAO });
    expect(validarRepresentada({ ...outro, comissao_pagamento_referencia: "faturamento", comissao_pagamento_dias: "0" })).toEqual({ comissao_pagamento_dias: MSG_DIAS_COMISSAO });
    expect(validarRepresentada({ ...outro, comissao_pagamento_referencia: "pagamento", comissao_pagamento_dias: "30" })).toEqual({});
    expect(representadaFormSchema.safeParse(outro).success).toBe(false);
    expect(representadaFormSchema.parse({ ...outro, comissao_pagamento_referencia: "faturamento", comissao_pagamento_dias: "30" })).toMatchObject({
      comissao_pagamento_tipo: "outro", comissao_pagamento_referencia: "faturamento", comissao_pagamento_dias: 30,
    });
  });

  it("fora de 'Outro', referência e dias viram null (inclusive no PATCH)", () => {
    const resto = { comissao_pagamento_referencia: "pagamento", comissao_pagamento_dias: "999" };
    expect(validarRepresentada({ ...valida, comissao_pagamento_tipo: "pagamento", ...resto })).toEqual({});
    expect(representadaFormSchema.parse({ ...valida, comissao_pagamento_tipo: "pagamento", ...resto })).toMatchObject({
      comissao_pagamento_tipo: "pagamento", comissao_pagamento_referencia: null, comissao_pagamento_dias: null,
    });
    expect(representadaParcialSchema.parse({ comissao_pagamento_tipo: "faturamento" })).toEqual({
      comissao_pagamento_tipo: "faturamento", comissao_pagamento_referencia: null, comissao_pagamento_dias: null,
    });
    expect(representadaParcialSchema.safeParse({ comissao_pagamento_tipo: "outro" }).success).toBe(false);
    expect(representadaParcialSchema.parse({ cidade: "Anápolis" })).toEqual({ cidade: "Anápolis" });
  });

  it("edição reconstrói os valores salvos", () => {
    expect(valoresDaRepresentada({ comissao_pagamento_tipo: "outro", comissao_pagamento_referencia: "pagamento", comissao_pagamento_dias: 45 })).toMatchObject({
      comissao_pagamento_tipo: "outro", comissao_pagamento_referencia: "pagamento", comissao_pagamento_dias: "45",
    });
  });

  it("rótulo da listagem/detalhe e ordenação", () => {
    expect(rotuloPagamentoComissao("faturamento")).toBe("No faturamento");
    expect(rotuloPagamentoComissao("pagamento")).toBe("No pagamento");
    expect(rotuloPagamentoComissao("outro", "faturamento", 30)).toBe("30 dias após o faturamento");
    expect(rotuloPagamentoComissao("outro", "pagamento", 45)).toBe("45 dias após o pagamento");
    expect(ORDENACOES.pagamento_comissao).toEqual(["comissao_pagamento_ordem", "comissao_pagamento_dias"]);
    expect(filtroRepresentadasSchema.parse({ ordem: "pagamento_comissao" }).ordem).toBe("pagamento_comissao");
  });
});

describe("pagamento da comissão na importação por planilha (fase 18)", async () => {
  const { COLUNAS_REPRESENTADA, importacaoRepresentadas: config } = await import("@/lib/cadastros/importacao-representadas");
  const { validarPlanilha } = await import("@/lib/importacao/motor");
  const cab = [...COLUNAS_REPRESENTADA];
  const base = { razao_social: "Alfa Ltda", cnpj: "11.222.333/0001-81", email_comercial: "a@a.com", cidade: "Goiânia", uf: "GO" };
  const umaLinha = async (v: Record<string, string>) =>
    (await validarPlanilha(config, cab, [{ numero_linha: 2, valores: cab.map((c) => ({ ...base, ...v } as Record<string, string>)[c] ?? "") }], new Map()))[0]!;

  it("modelo traz as 3 colunas e a linha de exemplo preenchida", () => {
    expect(cab.slice(-3)).toEqual(["comissao_pagamento_tipo", "comissao_pagamento_referencia", "comissao_pagamento_dias"]);
    expect(config.linhaExemplo).toMatchObject({ comissao_pagamento_tipo: "Outro", comissao_pagamento_referencia: "faturamento", comissao_pagamento_dias: "30" });
    expect(config.mensagemModelo).toContain("comissao_pagamento_tipo");
  });

  it("Outro + referência + dias (aceita os rótulos da tela)", async () => {
    const r = await umaLinha({ comissao_pagamento_tipo: "Outro", comissao_pagamento_referencia: "Dias após pagamento", comissao_pagamento_dias: "45" });
    expect(r.classificacao).toBe("valida");
    expect(r.dados).toMatchObject({ comissao_pagamento_tipo: "outro", comissao_pagamento_referencia: "pagamento", comissao_pagamento_dias: 45 });
  });

  it("Outro exige referência e dias; dias fora de 1–365 é erro", async () => {
    const r = await umaLinha({ comissao_pagamento_tipo: "outro" });
    expect(r.erros.map((e) => e.campo).sort()).toEqual(["comissao_pagamento_dias", "comissao_pagamento_referencia"]);
    const r2 = await umaLinha({ comissao_pagamento_tipo: "outro", comissao_pagamento_referencia: "faturamento", comissao_pagamento_dias: "12,5" });
    expect(r2.erros).toEqual([{ campo: "comissao_pagamento_dias", mensagem: MSG_DIAS_COMISSAO, valor_recebido: "12,5" }]);
  });

  it("No faturamento/No pagamento limpam referência e dias (preenchidos = alerta e ignorados)", async () => {
    const r = await umaLinha({ comissao_pagamento_tipo: "No pagamento", comissao_pagamento_dias: "999" });
    expect(r.erros).toEqual([]);
    expect(r.alertas.some((a) => a.campo === "comissao_pagamento_tipo")).toBe(true);
    expect(r.dados).toMatchObject({ comissao_pagamento_tipo: "pagamento", comissao_pagamento_referencia: null, comissao_pagamento_dias: null });
  });

  it("tipo vazio: nada é gravado; referência/dias sem tipo é erro", async () => {
    const r = await umaLinha({});
    expect(r.classificacao).toBe("valida");
    expect("comissao_pagamento_tipo" in r.dados).toBe(false);
    const r2 = await umaLinha({ comissao_pagamento_dias: "30" });
    expect(r2.erros.map((e) => e.campo)).toEqual(["comissao_pagamento_tipo"]);
  });
});
