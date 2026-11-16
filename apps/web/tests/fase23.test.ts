import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ETAPAS, PERGUNTAS_FREQUENTES, VERIFICACOES } from "@/lib/guia/conteudo";
import { diagnosticoGuia } from "@/server/guia";
import type { Contexto } from "@/server/contexto";

const APP = join(__dirname, "..", "src", "app");
/** rota real = existe page.tsx no caminho (segmentos dinâmicos não usados nos links do guia) */
const rotaExiste = (href: string) => existsSync(join(APP, ...href.split(/[?#]/)[0]!.split("/").filter(Boolean), "page.tsx"));

/** supabase falso: toda consulta devolve vazio (base nova) */
function supabaseVazio() {
  const resp = { data: [], count: 0, error: null };
  const builder: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(builder, {
    get: (_t, p) => (p === "then" ? (ok: (v: unknown) => unknown) => Promise.resolve(resp).then(ok) : () => proxy),
  });
  return { from: () => proxy } as unknown as Contexto["supabase"];
}

describe("fase 23.1 — página Como usar", () => {
  it("7 etapas na ordem e 8 perguntas, todas com conteúdo", () => {
    expect(ETAPAS.map((e) => e.id)).toEqual(["representadas", "catalogo", "clientes", "pedidos", "comissoes", "devolucoes", "analises"]);
    for (const e of ETAPAS) expect([e.titulo, e.porqueImporta, e.oQuePreencher.length > 0, e.oQueQuebra.length > 0]).not.toContain("");
    expect(PERGUNTAS_FREQUENTES).toHaveLength(8);
  });
  it("todo link aponta para rota real (sem 404)", () => {
    const links = [...ETAPAS.flatMap((e) => [e.linkPara, ...e.modulosRelacionados.map((m) => m.href)]), ...VERIFICACOES.map((v) => v.href), "/app/como-usar"];
    expect(links.filter((l) => !rotaExiste(l))).toEqual([]);
  });
  it("diagnóstico: 5 verificações; base vazia = 0% sem erro", async () => {
    const r = await diagnosticoGuia({ supabase: supabaseVazio(), userId: "u" } as Contexto);
    expect(r.verificacoes).toHaveLength(5);
    expect(r.verificacoes.every((v) => !v.ok)).toBe(true);
    expect(r.percentual).toBe(0);
  });
});
