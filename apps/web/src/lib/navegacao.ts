export const SECOES = [
  { slug: "representadas", titulo: "Representadas" },
  { slug: "clientes", titulo: "Clientes" },
  { slug: "oportunidades", titulo: "Oportunidades" },
  { slug: "comissoes", titulo: "Comissões" },
  { slug: "relatorios", titulo: "Relatórios" },
  { slug: "configurar", titulo: "Configurar" },
] as const;

export type SecaoSlug = (typeof SECOES)[number]["slug"];

export function buscarSecao(slug: string) {
  return SECOES.find((s) => s.slug === slug);
}
