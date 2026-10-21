import type { NomeIcone } from "@/components/icones";

/** Cookie com o estado da sidebar (colapsada/expandida), lido pelo layout no servidor. */
export const COOKIE_SIDEBAR = "sidebar";

export const SECOES = [
  { slug: "representadas", titulo: "Representadas", icone: "predio" },
  { slug: "clientes", titulo: "Clientes", icone: "pessoas" },
  { slug: "oportunidades", titulo: "Oportunidades", icone: "documento" },
  { slug: "comissoes", titulo: "Comissões", icone: "cifrao" },
  { slug: "configurar", titulo: "Configurar", icone: "engrenagem" },
] as const satisfies readonly { slug: string; titulo: string; icone: NomeIcone }[];

export type SecaoSlug = (typeof SECOES)[number]["slug"];

export function buscarSecao(slug: string) {
  return SECOES.find((s) => s.slug === slug);
}
