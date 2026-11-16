import type { NomeIcone } from "@/components/icones";

/** Cookie com o estado da sidebar (colapsada/expandida), lido pelo layout no servidor. */
export const COOKIE_SIDEBAR = "sidebar";

export const SECOES = [
  { slug: "representadas", titulo: "Representadas", icone: "predio" },
  { slug: "clientes", titulo: "Clientes", icone: "pessoas" },
  { slug: "pedidos", titulo: "Pedidos", icone: "carrinho" },
  { slug: "oportunidades", titulo: "Oportunidades", icone: "funil" },
  { slug: "calendario", titulo: "Calendário", icone: "calendario" },
  { slug: "comissoes", titulo: "Comissões", icone: "cifrao" },
  { slug: "custos", titulo: "Controle de Custos", icone: "carteira" },
  { slug: "analises", titulo: "Análises", icone: "grafico" },
  { slug: "biblioteca", titulo: "Biblioteca", icone: "documento" },
  { slug: "configurar", titulo: "Configurar", icone: "engrenagem" },
] as const satisfies readonly { slug: string; titulo: string; icone: NomeIcone }[];

export type SecaoSlug = (typeof SECOES)[number]["slug"];

/* ---------- Fase 23.3: menu lateral em grupos recolhíveis (só itens com rota real) ---------- */
/** href ausente = Sair (formulário); pendencia = selo numérico do item. */
export type ItemMenu = { href?: string; rotulo: string; icone: NomeIcone; pendencia?: "pedidos" | "comissoes" };
export type GrupoMenu = { id: string; rotulo: string; itens: ItemMenu[] };
const secao = (slug: SecaoSlug, extra: Partial<ItemMenu> = {}): ItemMenu => {
  const s = buscarSecao(slug)!;
  return { href: `/app/${s.slug}`, rotulo: s.titulo, icone: s.icone, ...extra };
};
export const GRUPOS_MENU: GrupoMenu[] = [
  { id: "visao", rotulo: "Visão geral", itens: [{ href: "/app", rotulo: "Dashboard", icone: "painel" }, secao("calendario")] },
  { id: "cadastros", rotulo: "Cadastros", itens: [secao("representadas"), secao("clientes")] },
  { id: "vendas", rotulo: "Vendas", itens: [secao("pedidos", { pendencia: "pedidos" }), secao("oportunidades")] },
  { id: "financeiro", rotulo: "Financeiro", itens: [secao("comissoes", { pendencia: "comissoes" }), secao("custos")] },
  { id: "analise", rotulo: "Análise", itens: [secao("analises"), secao("biblioteca")] },
];
/** Bloco 2 do rodapé fixo (sempre visível, fora dos grupos). */
export const ITENS_CONTA: ItemMenu[] = [
  { href: "/app/configurar", rotulo: "Configurações", icone: "engrenagem" },
  { href: "/app/perfil", rotulo: "Meus dados", icone: "usuario" },
];
/** Bloco 3 do rodapé fixo: junto do botão de tema. */
export const ITEM_SAIR: ItemMenu = { rotulo: "Sair", icone: "sair" };
/** Bloco 4 do rodapé fixo (último): nunca participa de grupo. */
export const ITEM_COMO_USAR: ItemMenu = { href: "/app/como-usar", rotulo: "Como usar", icone: "info" };

export function buscarSecao(slug: string) {
  return SECOES.find((s) => s.slug === slug);
}
