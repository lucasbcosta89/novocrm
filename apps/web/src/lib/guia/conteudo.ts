/**
 * Fase 23.1 — conteúdo da página "Como usar" (FONTE ÚNICA: a página só renderiza o que está aqui).
 * Alterar este arquivo muda a página sem tocar em componente. Rotas = rotas REAIS da plataforma.
 * Decisões: rota /app/como-usar; o prazo do cliente é informado em cada PEDIDO (clientes não têm campo de prazo);
 * funis organizam OPORTUNIDADES (não pedidos); desconto máximo padrão da conta fica em Meus dados.
 */

export type GuiaEtapa = {
  id: string;
  titulo: string;
  subtitulo: string;
  porqueImporta: string;
  oQuePreencher: string[];
  oQueQuebra: string[];
  nota?: string;
  linkPara: string;
  rotuloLink?: string;
  modulosRelacionados: { rotulo: string; href: string }[];
};

export type PerguntaFrequente = { pergunta: string; resposta: string };

export const GUIA_TITULO = "Como usar";
export const GUIA_SUBTITULO =
  "Preencha os cadastros nesta ordem: cada etapa alimenta a seguinte e, no fim, comissões e relatórios saem completos.";

export const ETAPAS: GuiaEtapa[] = [
  {
    id: "representadas",
    titulo: "1. Representadas",
    subtitulo: "As empresas que você representa e as regras de comissão de cada uma.",
    porqueImporta:
      "A comissão da representada tem PRECEDÊNCIA sobre a do catálogo. Sem ela, a comissão cai para o catálogo do produto; se os dois faltarem, a venda entra com comissão zero.",
    oQuePreencher: [
      "Razão social e CNPJ.",
      "Comissão fixa (%), quando a representada paga um percentual único.",
      "Pagamento da Comissão: No faturamento, No recebimento ou Outro (com a referência e os dias).",
      "Desconto máximo (%) permitido nos pedidos.",
    ],
    oQueQuebra: [
      "Sem Pagamento da Comissão, a data prevista de recebimento não é calculada e a comissão fica pendente de análise.",
      "Sem desconto máximo, a checagem usa o padrão da conta (Meus dados) e, sem ele, 10%.",
    ],
    linkPara: "/app/representadas",
    modulosRelacionados: [{ rotulo: "Desconto máximo padrão (Meus dados)", href: "/app/perfil#pedidos" }],
  },
  {
    id: "catalogo",
    titulo: "2. Catálogo de Produtos",
    subtitulo: "Os produtos de cada representada (abra a representada › Catálogo).",
    porqueImporta:
      "O preço do catálogo é a referência do alerta de preço divergente; a comissão do catálogo é usada quando a representada não tem comissão fixa.",
    oQuePreencher: ["SKU e nome.", "Preço padrão e desconto máximo.", "Comissão (%), quando varia por produto.", "Ativo ou inativo."],
    oQueQuebra: [
      "Produto sem comissão em representada sem comissão fixa = venda com comissão zero.",
      "SKU fora do catálogo vira pendência no pedido (item sem produto vinculado).",
    ],
    nota: "Desative produtos em vez de excluir: pedidos antigos apontam para eles.",
    linkPara: "/app/representadas",
    rotuloLink: "Ir para Representadas › Catálogo",
    modulosRelacionados: [],
  },
  {
    id: "clientes",
    titulo: "3. Clientes",
    subtitulo: "Quem compra de você.",
    porqueImporta:
      "O cliente identifica o pedido (inclusive na importação por Excel, pelo CNPJ/CPF). O prazo de pagamento do cliente é informado em cada pedido e entra na data prevista de recebimento quando a comissão é paga no recebimento.",
    oQuePreencher: ["Nome.", "CNPJ ou CPF.", "No pedido: forma e prazo de pagamento (à vista conta como 0 dias)."],
    oQueQuebra: ["Pedido a prazo sem dias deixa a previsão incompleta e a comissão vai para a fila de análise."],
    linkPara: "/app/clientes",
    modulosRelacionados: [],
  },
  {
    id: "pedidos",
    titulo: "4. Pedidos (manual e Excel)",
    subtitulo: "A origem de tudo: comissão, previsão de recebimento e relatórios.",
    porqueImporta: "O pedido gera a comissão, a previsão de recebimento e os números das análises.",
    oQuePreencher: [
      "Manual: cliente, representada, itens com produto, quantidade, preço, desconto e a Data de Faturamento (pode ficar em branco e ser preenchida depois).",
      "Excel: use o modelo oficial. A coluna Comissão (R$) é opcional; vazia ou zerada é calculada pelo cadastro e o item vai para a fila de análise.",
    ],
    oQueQuebra: [
      "Item sem produto vinculado gera pendência; a comissão dele vem da representada.",
      "Desconto acima do limite e preço divergente NÃO bloqueiam: criam alertas no quadro de divergências.",
    ],
    nota: "Planilha com fórmula na coluna de comissão: abra e salve no Excel antes de enviar.",
    linkPara: "/app/pedidos",
    modulosRelacionados: [{ rotulo: "Cadastrar Pedidos com Excel", href: "/app/pedidos/importar" }],
  },
  {
    id: "comissoes",
    titulo: "5. Comissões",
    subtitulo: "Conferência do que você vai receber.",
    porqueImporta: "Comissão incompleta não é liquidada automaticamente e não entra nos totais de recebido e a receber.",
    oQuePreencher: [
      "Resolva o aviso “Você possui comissões pendentes de análise”.",
      "Motivos: comissão não definida, comissão zerada na planilha, pedido sem data de faturamento, representada sem prazo de pagamento da comissão, pedido sem prazo do cliente.",
    ],
    oQueQuebra: ["Comissão em análise fica fora do recebido e do a receber: é um indicador próprio."],
    nota: "A data de recebimento pode ser editada a qualquer momento; data digitada por você nunca é sobrescrita pela rotina.",
    linkPara: "/app/comissoes",
    modulosRelacionados: [{ rotulo: "Fila de análise", href: "/app/comissoes?visao=analise" }],
  },
  {
    id: "devolucoes",
    titulo: "6. Devoluções",
    subtitulo: "Na página do cliente › Devoluções (manual ou por Excel).",
    porqueImporta: "Cada devolução gera uma comissão NEGATIVA vinculada; o mês mostra bruto, devoluções e líquido separados.",
    oQuePreencher: [
      "Manual ou pelo modelo oficial de Excel.",
      "Data de Processamento quando a devolução já foi acertada com a representada.",
    ],
    oQueQuebra: ["Sem Data de Processamento, o estorno fica previsto e não reduz o recebido do mês."],
    nota: "A quantidade devolvida não pode passar da vendida, e o estorno nunca passa da comissão original.",
    linkPara: "/app/clientes",
    rotuloLink: "Ir para Clientes › Devoluções",
    modulosRelacionados: [{ rotulo: "Devoluções (análise)", href: "/app/comissoes?visao=devolucoes" }],
  },
  {
    id: "analises",
    titulo: "7. Análises e Funis",
    subtitulo: "Leitura do negócio: depende das etapas 1 a 6.",
    porqueImporta: "Os relatórios somam apenas os grupos de status declarados; dados incompletos aparecem, mas fora dos totais.",
    oQuePreencher: [
      "Nada a preencher aqui.",
      "Funis organizam OPORTUNIDADES: crie o funil e as etapas e mova cada oportunidade; quando fecha, vira pedido.",
    ],
    oQueQuebra: ["Período sem pedidos, sem comissões ou com itens sem produto gera relatório vazio ou linhas “sem produto”."],
    linkPara: "/app/analises",
    modulosRelacionados: [{ rotulo: "Funis de vendas", href: "/app/oportunidades/funis" }],
  },
];

export const PERGUNTAS_FREQUENTES: PerguntaFrequente[] = [
  { pergunta: "Por que minha comissão está zerada?", resposta: "Nem a representada nem o catálogo do produto tinham comissão. Defina em um dos dois e use “Definir comissão” na página de Comissões." },
  { pergunta: "O que significa “pendente de análise”?", resposta: "Falta um dado obrigatório (comissão, faturamento ou prazo). A comissão não é liquidada até ser resolvida ou analisada por você." },
  { pergunta: "Posso emitir pedido com desconto acima do limite?", resposta: "Sim. Gera um alerta no quadro de divergências, sem bloquear." },
  { pergunta: "Posso emitir pedido com preço diferente do catálogo?", resposta: "Sim. Gera um alerta com a opção de atualizar o preço no catálogo." },
  { pergunta: "Por que a data prevista não apareceu?", resposta: "Falta a Data de Faturamento no pedido ou o Pagamento da Comissão na representada." },
  { pergunta: "Posso mudar a data de recebimento depois?", resposta: "Sim, em qualquer status. A alteração fica registrada no histórico da comissão." },
  { pergunta: "Devolução reduz minha comissão?", resposta: "Sim, quando tem Data de Processamento (ou é marcada como processada): o estorno entra nesse mês." },
  { pergunta: "Como importar dados por Excel?", resposta: "Use o modelo oficial de cada módulo (Representadas, Clientes, Catálogo, Pedidos e Devoluções). Há prévia antes de gravar." },
];

/** Diagnóstico de completude (C): rótulos, impacto e destino de cada verificação — o resultado vem do banco. */
export const VERIFICACOES = [
  { id: "representada_comissao", rotulo: "Representada com comissão fixa", impacto: "Sem ela, a comissão depende só do catálogo e pode sair zero.", href: "/app/representadas" },
  { id: "produtos_comissao", rotulo: "Produtos ativos com comissão definida", impacto: "Produto sem comissão em representada sem comissão fixa gera venda com comissão zero.", href: "/app/representadas" },
  { id: "pedido_faturamento", rotulo: "Pedido com Data de Faturamento", impacto: "Sem faturamento não há previsão de recebimento e a comissão fica em análise.", href: "/app/pedidos" },
  { id: "pagamento_comissao", rotulo: "Representada com Pagamento da Comissão configurado", impacto: "Base da data prevista de recebimento.", href: "/app/representadas" },
  { id: "prazo_cliente", rotulo: "Nenhuma comissão em análise por falta de prazo do cliente", impacto: "O prazo do cliente é informado no pedido; sem ele a previsão fica incompleta.", href: "/app/comissoes?visao=analise&mot=sem_prazo_cliente" },
] as const;
export type VerificacaoId = (typeof VERIFICACOES)[number]["id"];

export const rotuloProntidao = (pct: number) => `Seu cadastro está ${pct}% pronto para relatórios completos`;
