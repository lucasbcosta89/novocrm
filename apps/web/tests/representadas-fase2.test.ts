import { describe, expect, it } from "vitest";
import { filtroRepresentadasSchema, ORDENACOES, termoBusca, urlListagem } from "@/lib/cadastros/listagem-representadas";
import { gerarCsv } from "@/lib/csv";
import { padraoBusca } from "@/server/consultas";

describe("representadas fase 2 — listagem", () => {
  it("filtro da URL: padrões, UF normalizada e valores fora da whitelist descartados", () => {
    expect(filtroRepresentadasSchema.parse({})).toEqual({ q: "", status: null, uf: null, ordem: "razao_social", dir: "asc", pagina: 1 });
    const f = filtroRepresentadasSchema.parse({ q: "  Alfa ", status: "inativa", uf: "go", ordem: "vendido_90d", dir: "desc", pagina: "3" });
    expect(f).toEqual({ q: "Alfa", status: "inativa", uf: "GO", ordem: "vendido_90d", dir: "desc", pagina: 3 });
    const lixo = filtroRepresentadasSchema.parse({ status: "x", uf: "ZZ", ordem: "razao_social; drop table", dir: "up", pagina: "-1" });
    expect(lixo).toMatchObject({ status: null, uf: null, ordem: "razao_social", dir: "asc", pagina: 1 });
  });

  it("ordenação disponível em todas as colunas da tabela", () => {
    expect(Object.keys(ORDENACOES)).toEqual(["codigo", "razao_social", "cnpj", "cidade_uf", "comissao", "status", "clientes", "vendido_90d"]);
  });

  it("CNPJ com e sem máscara vira o mesmo termo; texto fica como está (curingas escapados)", () => {
    expect(termoBusca("11.222.333/0001-81")).toBe("11222333000181");
    expect(termoBusca("11222333000181")).toBe("11222333000181");
    expect(termoBusca("333/0001")).toBe("3330001");
    expect(termoBusca("Alfa 3M")).toBe("Alfa 3M");
    expect(padraoBusca(termoBusca("50%_off"))).toBe("%50\\%\\_off%");
  });

  it("URL da listagem preserva a visão e omite padrões (paginação e exportação usam a mesma visão)", () => {
    const f = filtroRepresentadasSchema.parse({ q: "alfa", uf: "SP", ordem: "cnpj", dir: "desc", pagina: 2 });
    expect(urlListagem(f)).toBe("/app/representadas?q=alfa&uf=SP&ordem=cnpj&dir=desc&pagina=2");
    expect(urlListagem(f, { pagina: 1 }, "/api/representadas/exportar")).toBe("/api/representadas/exportar?q=alfa&uf=SP&ordem=cnpj&dir=desc");
    expect(urlListagem(filtroRepresentadasSchema.parse({}))).toBe("/app/representadas");
  });

  it("CSV: BOM UTF-8, separador ;, vírgula decimal, aspas quando preciso e acentos preservados", () => {
    const csv = gerarCsv(["Razão social", "Comissão"], [["Calçados; São João \"SJ\"", 7.5]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('Razão social;Comissão\r\n"Calçados; São João ""SJ""";7,5');
  });
});
