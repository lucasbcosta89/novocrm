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
