import { describe, expect, it } from "vitest";
import { avisosDoItem, descreverAlerta, NIVEL_TIPO_ALERTA, resolverComissao, type EntradaAvisos } from "@/lib/comissao";
import { comissaoEfetiva, formatarDia, formatarMoeda } from "@/lib/formato";
import { dataFaturamentoSchema, edicaoPedidoSchema, pedidoSchema } from "@/lib/validacao";
import { filtroAlertasSchema } from "@/lib/comissao";

const REP = "33333333-3333-4333-8333-333333333333";
const CLI = "44444444-4444-4444-8444-444444444444";
const PROD = "55555555-5555-4555-8555-555555555555";

describe("fase 19 — precedência de comissão (D.1–D.5)", () => {
  it("D.1 ambos definidos: vale a representada, sem alerta (divergência só sinalizada)", () => {
    expect(resolverComissao({ comissao: 3 }, { comissao_percentual: 5 })).toEqual({ percentual: 5, origem: "representada", tipoAlerta: null, oferecerPropagacao: false, divergencia: true });
    expect(resolverComissao({ comissao: 5 }, { comissao_percentual: 5 })!.divergencia).toBe(false);
  });
  it("D.2 catálogo vazio: vale a representada e só OFERECE a propagação (nada gravado)", () => {
    for (const vazio of [null, 0, undefined]) {
      expect(resolverComissao({ comissao: vazio }, { comissao_percentual: 5 })).toEqual({ percentual: 5, origem: "representada", tipoAlerta: null, oferecerPropagacao: true, divergencia: false });
    }
  });
  it("D.3 representada vazia (nula ou 0): vale o catálogo + alerta, sem zerar", () => {
    for (const vazio of [null, 0]) {
      expect(resolverComissao({ comissao: 3 }, { comissao_percentual: vazio })).toEqual({ percentual: 3, origem: "catalogo", tipoAlerta: "comissao_catalogo_sem_representada", oferecerPropagacao: false, divergencia: false });
    }
  });
  it("D.4 nenhum: 0% + alerta comissao_nao_definida; D.5 sem produto: não resolve", () => {
    expect(resolverComissao({ comissao: null }, { comissao_percentual: 0 })).toMatchObject({ percentual: 0, origem: "zero", tipoAlerta: "comissao_nao_definida" });
    expect(resolverComissao(null, { comissao_percentual: 5 })).toBeNull();
  });
  it("exibição (comissaoEfetiva) segue a mesma regra", () => {
    expect(comissaoEfetiva(3, 5)).toEqual({ valor: 5, origem: "representada" });
    expect(comissaoEfetiva(3, 0)).toEqual({ valor: 3, origem: "produto" });
  });
});

const base: EntradaAvisos = {
  manual: true, quantidade: 1, preco: 100, desconto: 0, precoCatalogo: 100, descontoMax: 10, comissaoCatalogo: 3, temProduto: true, comissaoRepresentada: 5,
};
const tipos = (e: Partial<EntradaAvisos>) => avisosDoItem({ ...base, ...e }).map((a) => a.tipo);

describe("fase 19 — avisos durante o preenchimento (E)", () => {
  it("desconto acima do máximo (amarelo) e preço divergente (laranja) com as mensagens da especificação", () => {
    const a = avisosDoItem({ ...base, desconto: 18, preco: 92 });
    expect(a.map((x) => [x.tipo, x.nivel, x.mensagem])).toEqual([
      ["desconto_acima_limite", "amarelo", "Desconto de 18% acima do máximo permitido (10%)."],
      ["preco_divergente", "laranja", `Preço ${formatarMoeda(92)} difere do catálogo (${formatarMoeda(100)}).`],
    ]);
  });
  it("corrigir o valor some com o aviso; sem limite (0/nulo) não há aviso de desconto; item fora do pedido não avisa", () => {
    expect(tipos({ desconto: 10, preco: 100 })).toEqual([]);
    expect(tipos({ desconto: 50, descontoMax: 0 })).toEqual([]);
    expect(tipos({ desconto: 50, quantidade: 0 })).toEqual([]);
  });
  it("comissão: não definida e catálogo sem representada (vermelho), propagação (neutro)", () => {
    const nd = avisosDoItem({ ...base, comissaoCatalogo: null, comissaoRepresentada: null });
    expect(nd).toEqual([{ tipo: "comissao_nao_definida", nivel: "vermelho", mensagem: "Comissão não definida — este pedido ficará com comissão zero. Defina a comissão em Representadas ou no Catálogo." }]);
    const cs = avisosDoItem({ ...base, comissaoRepresentada: 0 });
    expect(cs[0]!.mensagem).toBe("Comissão de 3% aplicada do Catálogo, mas a Representada não tem comissão definida. Padronize o cadastro da representada.");
    const pr = avisosDoItem({ ...base, comissaoCatalogo: null });
    expect(pr).toEqual([{ tipo: "propagacao", nivel: "neutro", mensagem: "Comissão de 5% aplicada da Representada. O Catálogo deste produto está sem comissão.", percentual: 5 }]);
    expect(tipos({})).toEqual([]); // D.1: sem aviso
    expect(tipos({ comissaoCatalogo: null, comissaoRepresentada: null, comissaoItem: 4 })).toEqual([]); // item com comissão gravada
  });
  it("G: pedido importado não avisa desconto, preço nem propagação — só comissão", () => {
    expect(tipos({ manual: false, desconto: 30, preco: 70, comissaoCatalogo: null })).toEqual([]);
    expect(tipos({ manual: false, desconto: 30, comissaoRepresentada: null })).toEqual(["comissao_catalogo_sem_representada"]);
    expect(tipos({ manual: false, comissaoCatalogo: null, comissaoRepresentada: null })).toEqual(["comissao_nao_definida"]);
  });
});

describe("fase 19 — quadro de divergências (I)", () => {
  it("valor praticado × referência e diferença para ordenar; severidade por tipo", () => {
    expect(descreverAlerta("desconto_acima_limite", { desconto_aplicado: 18, desconto_maximo: 10 })).toEqual({ praticado: "Desconto 18%", referencia: "Máximo 10%", diferenca: 8 });
    expect(descreverAlerta("preco_divergente", { preco_praticado: 92, preco_catalogo: 100 })).toMatchObject({ diferenca: 8 });
    expect(descreverAlerta("comissao_catalogo_sem_representada", { comissao_catalogo: 3 }).praticado).toBe("3% do Catálogo");
    expect(NIVEL_TIPO_ALERTA).toEqual({ desconto_acima_limite: "amarelo", preco_divergente: "laranja", comissao_nao_definida: "vermelho", comissao_catalogo_sem_representada: "vermelho" });
  });
  it("filtros: status pendente por padrão; valores inválidos caem no padrão", () => {
    expect(filtroAlertasSchema.parse({})).toEqual({ a_tipo: null, a_status: "pendente", a_ordem: "data" });
    expect(filtroAlertasSchema.parse({ a_tipo: "preco_divergente", a_status: "aprovado", a_ordem: "diferenca" })).toEqual({ a_tipo: "preco_divergente", a_status: "aprovado", a_ordem: "diferenca" });
    expect(filtroAlertasSchema.parse({ a_tipo: "xx", a_status: "yy" })).toEqual({ a_tipo: null, a_status: "pendente", a_ordem: "data" });
  });
});

describe("fase 19 — data de faturamento (C)", () => {
  it("opcional: vazio = null; passada/futura aceitas; inválida recusada", () => {
    expect(dataFaturamentoSchema.parse("")).toBeNull();
    expect(dataFaturamentoSchema.parse(undefined)).toBeNull();
    expect(dataFaturamentoSchema.parse("2020-01-31")).toBe("2020-01-31");
    expect(dataFaturamentoSchema.parse("2030-12-01")).toBe("2030-12-01");
    expect(dataFaturamentoSchema.safeParse("2026-02-31").success).toBe(false);
    expect(dataFaturamentoSchema.safeParse("01/12/2026").success).toBe(false);
  });
  it("criação e edição levam a data (ou null) ao banco; exibição sem conversão de fuso", () => {
    const item = { produto_id: PROD, quantidade: "1" };
    expect(pedidoSchema.parse({ representada_id: REP, cliente_id: CLI, itens: [item] }).data_faturamento).toBeNull();
    expect(pedidoSchema.parse({ representada_id: REP, cliente_id: CLI, itens: [item], data_faturamento: "2026-12-01" }).data_faturamento).toBe("2026-12-01");
    expect(edicaoPedidoSchema.parse({ itens: [{ ...item, preco_unitario: "10" }], data_faturamento: "" }).data_faturamento).toBeNull();
    expect(formatarDia("2026-12-01")).toBe("01/12/2026");
  });
});
