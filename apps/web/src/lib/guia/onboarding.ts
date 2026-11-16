/**
 * Fase 23.2 — roteiro do passo a passo do primeiro login (7 passos, no máximo 80 palavras cada).
 * Os passos 2 a 7 navegam para a rota REAL (o painel continua aberto e a página de destino ganha destaque).
 * Funis organizam OPORTUNIDADES; o prazo do cliente é informado no pedido.
 */
export type PassoOnboarding = {
  titulo: string;
  texto: string[];
  href?: string;
  downloads?: { rotulo: string; href: string }[];
};

export const MODELOS_PLANILHA = [
  { rotulo: "Modelo de pedidos (com a coluna opcional Comissão R$)", href: "/templates/modelo-cadastro-pedidos.xlsx" },
  { rotulo: "Modelo de devoluções", href: "/templates/modelo-devolucoes.xlsx" },
];

export const PASSOS_ONBOARDING: PassoOnboarding[] = [
  {
    titulo: "Boas-vindas à Plurima",
    texto: [
      "A Plurima consolida o que está disperso: você cadastra representadas, clientes e produtos, lança vendas, apura comissões e analisa resultados num só lugar.",
      "Este passo a passo leva menos de dois minutos.",
    ],
  },
  {
    titulo: "Representadas",
    texto: [
      "Comece pelas empresas que você representa. Preencha primeiro a Comissão fixa e o Pagamento da Comissão.",
      "A comissão da representada tem precedência sobre a do catálogo; o pagamento define quando você recebe.",
    ],
    href: "/app/representadas",
  },
  {
    titulo: "Catálogo de produtos",
    texto: [
      "Em cada representada, abra o Catálogo e cadastre SKU, preço e comissão.",
      "Produto sem comissão usa a da representada. Para tirar um produto de venda, desative em vez de excluir: os pedidos antigos continuam íntegros.",
    ],
    href: "/app/representadas",
  },
  {
    titulo: "Clientes",
    texto: [
      "Cadastre nome e CNPJ ou CPF. O documento identifica o cliente, inclusive nas planilhas.",
      "O prazo de pagamento do cliente é informado em cada pedido e entra na previsão de recebimento da comissão.",
    ],
    href: "/app/clientes",
  },
  {
    titulo: "Migração por Excel",
    texto: [
      "O passo mais importante: traga seu histórico com as planilhas modelo.",
      "Comissão vazia ou zerada é calculada pelo cadastro. Planilha com fórmula deve ser salva no Excel antes do envio. Antes de gravar, a importação mostra uma prévia com linhas válidas, com alerta, inválidas e duplicadas.",
    ],
    href: "/app/pedidos/importar",
    downloads: MODELOS_PLANILHA,
  },
  {
    titulo: "Funis de vendas",
    texto: [
      "Funis organizam suas oportunidades: crie o funil e as etapas, mova cada oportunidade e veja onde as vendas param.",
      "O funil é visualização: quando a oportunidade fecha, o pedido continua sendo o registro da venda.",
    ],
    href: "/app/oportunidades/funis",
  },
  {
    titulo: "Análises",
    texto: [
      "Os relatórios cruzam período, representada, status e completude.",
      "Comissão em análise não entra nos totais, e o dashboard separa recebido bruto, devoluções e líquido. Quanto mais completos os cadastros, mais completos os relatórios.",
    ],
    href: "/app/analises",
  },
];

export const palavrasDoPasso = (p: PassoOnboarding) => [p.titulo, ...p.texto].join(" ").split(/\s+/).filter(Boolean).length;
