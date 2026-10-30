import "server-only";
import type { Content } from "pdfmake/interfaces";
import { formatarData, formatarDocumento, formatarMoeda, formatarPercentual } from "@/lib/formato";
import { cabecalho, gerarPdf, indicadores, secao, tabela, type Representante } from "@/lib/pdf";
import { idSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";
import { limitesPeriodo, periodoAnterior } from "./relatorios";

/** Relatórios da Biblioteca (Fase 10): vendas (geral, por cliente, por representada) e KPIs. Template da Fase 7b. */

const VENDA = ["confirmado", "entregue"];
const soma = (xs: number[]) => Math.round(xs.reduce((s, x) => s + Number(x), 0) * 100) / 100;
const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`);
const mesSP = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
const rotuloMes = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

type Item = { quantidade: number; preco_unitario: number; desconto_percentual: number; subtotal: number; descricao: string | null; produto: { sku: string; nome: string } | null };
export type PedidoVenda = {
  id: string; codigo_pedido: string; data: string; valor_total: number;
  cliente: { id: string; nome: string } | null;
  representada: { id: string; nome: string } | null;
  itens?: Item[];
};

async function pedidosVenda(ctx: Contexto, periodo: string, filtro: { cliente_id?: string; representada_id?: string }, comItens: boolean): Promise<PedidoVenda[]> {
  const { inicio, fim } = limitesPeriodo(periodo);
  let q = ctx.supabase
    .from("pedidos")
    .select(
      `id, codigo_pedido, data, valor_total, cliente:clientes(id, nome), representada:representadas(id, nome:razao_social)${
        comItens ? ", itens:pedido_itens(quantidade, preco_unitario, desconto_percentual, subtotal, descricao, produto:produtos(sku, nome))" : ""
      }`,
    )
    .in("status", VENDA)
    .gte("data", inicio)
    .lt("data", fim)
    .order("data");
  if (filtro.cliente_id) q = q.eq("cliente_id", idSchema.parse(filtro.cliente_id));
  if (filtro.representada_id) q = q.eq("representada_id", idSchema.parse(filtro.representada_id));
  const { data, error } = await q.limit(5000).returns<PedidoVenda[]>();
  if (error) throw erroBanco(error);
  return data;
}

const resumo = (ps: PedidoVenda[]) => {
  const total = soma(ps.map((p) => p.valor_total));
  return { total, pedidos: ps.length, ticket: ps.length ? Math.round((total / ps.length) * 100) / 100 : 0 };
};

function agrupar<K>(ps: PedidoVenda[], chave: (p: PedidoVenda) => K | null, nome: (p: PedidoVenda) => string) {
  const m = new Map<K, { nome: string; pedidos: number; total: number }>();
  for (const p of ps) {
    const k = chave(p);
    if (k == null) continue;
    const g = m.get(k) ?? { nome: nome(p), pedidos: 0, total: 0 };
    g.pedidos += 1;
    g.total += Number(p.valor_total);
    m.set(k, g);
  }
  return [...m.values()].map((g) => ({ ...g, total: Math.round(g.total * 100) / 100 })).sort((a, b) => b.total - a.total);
}

type Grupo = ReturnType<typeof agrupar>[number];
const tabelaGrupo = (titulo: string, grupos: Grupo[], vazio: string, totalGeral?: number) =>
  tabela(
    [
      { titulo, valor: (g: Grupo) => g.nome },
      { titulo: "Pedidos", valor: (g) => g.pedidos, alinhar: "right", largura: "auto" },
      { titulo: "Ticket médio", valor: (g) => formatarMoeda(g.pedidos ? g.total / g.pedidos : 0), alinhar: "right", largura: "auto" },
      { titulo: "Total", valor: (g) => formatarMoeda(g.total), alinhar: "right", largura: "auto" },
    ],
    grupos,
    { vazio, ...(totalGeral != null ? { totais: ["Total", grupos.reduce((s, g) => s + g.pedidos, 0), "", formatarMoeda(totalGeral)] } : {}) },
  );

const blocoResumo = (r: ReturnType<typeof resumo>): Content =>
  indicadores([
    { rotulo: "Total vendido", valor: formatarMoeda(r.total) },
    { rotulo: "Pedidos", valor: String(r.pedidos) },
    { rotulo: "Ticket médio", valor: formatarMoeda(r.ticket) },
  ]);

/* ---------- 1. Vendas — Geral ---------- */

export type DadosVendasGeral = { periodo: string; pedidos: PedidoVenda[] };

export async function dadosVendasGeral(ctx: Contexto, periodo: string): Promise<DadosVendasGeral> {
  return { periodo, pedidos: await pedidosVenda(ctx, periodo, {}, false) };
}

export function pdfVendasGeral(d: DadosVendasGeral, rep?: Representante): Promise<Uint8Array> {
  const { rotulo } = limitesPeriodo(d.periodo);
  const r = resumo(d.pedidos);
  const conteudo: Content[] = [
    cabecalho(`Vendas — Geral — ${rotulo}`, "Pedidos confirmados e entregues"),
    blocoResumo(r),
    secao("Por mês"),
    tabelaGrupo("Mês", agrupar(d.pedidos, (p) => mesSP(p.data), (p) => rotuloMes(mesSP(p.data))).sort((a, b) => (a.nome.slice(3) + a.nome.slice(0, 2)).localeCompare(b.nome.slice(3) + b.nome.slice(0, 2))), "Nenhuma venda no período.", r.total),
    secao("Por representada"),
    tabelaGrupo("Representada", agrupar(d.pedidos, (p) => p.representada?.id ?? null, (p) => p.representada?.nome ?? "—"), "Nenhuma venda no período.", r.total),
    secao("Top 10 clientes"),
    tabelaGrupo("Cliente", agrupar(d.pedidos, (p) => p.cliente?.id ?? null, (p) => p.cliente?.nome ?? "—").slice(0, 10), "Nenhuma venda no período."),
  ];
  return gerarPdf(conteudo, { titulo: `Vendas geral ${d.periodo}`, representante: rep });
}

/* ---------- 2. Vendas — Por Cliente ---------- */

export type DadosVendasCliente = { periodo: string; cliente: { id: string; nome: string }; pedidos: PedidoVenda[] };

export async function dadosVendasCliente(ctx: Contexto, periodo: string, clienteId: string): Promise<DadosVendasCliente> {
  const { data: cliente, error } = await ctx.supabase.from("clientes").select("id, nome").eq("id", idSchema.parse(clienteId)).maybeSingle<DadosVendasCliente["cliente"]>();
  if (error) throw erroBanco(error);
  if (!cliente) throw new AppError(404, "Cliente não encontrado", "nao_encontrado");
  return { periodo, cliente, pedidos: await pedidosVenda(ctx, periodo, { cliente_id: cliente.id }, true) };
}

export function pdfVendasCliente(d: DadosVendasCliente, rep?: Representante): Promise<Uint8Array> {
  const { rotulo } = limitesPeriodo(d.periodo);
  const r = resumo(d.pedidos);
  const conteudo: Content[] = [
    // CPF/CNPJ do cliente nunca entra no PDF
    cabecalho(`Vendas — ${d.cliente.nome} — ${rotulo}`, "Pedidos confirmados e entregues"),
    blocoResumo(r),
  ];
  if (d.pedidos.length === 0) conteudo.push({ text: "Nenhum pedido do cliente no período.", style: "vazio" });
  for (const p of d.pedidos) {
    conteudo.push(
      secao(`Pedido ${p.codigo_pedido} · ${formatarData(p.data)} · ${p.representada?.nome ?? "—"} · ${formatarMoeda(p.valor_total)}`),
      tabela(
        [
          { titulo: "SKU", valor: (i: Item) => i.produto?.sku ?? "—", largura: "auto" },
          { titulo: "Produto", valor: (i) => i.produto?.nome ?? i.descricao ?? "—" },
          { titulo: "Qtd.", valor: (i) => String(Number(i.quantidade)).replace(".", ","), alinhar: "right", largura: "auto" },
          { titulo: "Preço un.", valor: (i) => formatarMoeda(i.preco_unitario), alinhar: "right", largura: "auto" },
          { titulo: "Desc.", valor: (i) => formatarPercentual(i.desconto_percentual), alinhar: "right", largura: "auto" },
          { titulo: "Subtotal", valor: (i) => formatarMoeda(i.subtotal), alinhar: "right", largura: "auto" },
        ],
        p.itens ?? [],
        { vazio: "Pedido sem itens.", totais: ["Total", "", "", "", "", formatarMoeda(p.valor_total)] },
      ),
    );
  }
  return gerarPdf(conteudo, { titulo: `Vendas ${d.cliente.nome} ${d.periodo}`, representante: rep });
}

/* ---------- 3. Vendas — Por Representada ---------- */

export type DadosVendasRepresentada = { periodo: string; representada: { id: string; nome: string; cnpj: string | null }; pedidos: PedidoVenda[] };

export async function dadosVendasRepresentada(ctx: Contexto, periodo: string, representadaId: string): Promise<DadosVendasRepresentada> {
  const { data: representada, error } = await ctx.supabase.from("representadas").select("id, nome:razao_social, cnpj").eq("id", idSchema.parse(representadaId)).maybeSingle<DadosVendasRepresentada["representada"]>();
  if (error) throw erroBanco(error);
  if (!representada) throw new AppError(404, "Representada não encontrada", "nao_encontrado");
  return { periodo, representada, pedidos: await pedidosVenda(ctx, periodo, { representada_id: representada.id }, true) };
}

type LinhaProduto = { sku: string; nome: string; quantidade: number; total: number };

export function pdfVendasRepresentada(d: DadosVendasRepresentada, rep?: Representante): Promise<Uint8Array> {
  const { rotulo } = limitesPeriodo(d.periodo);
  const r = resumo(d.pedidos);
  const produtos = new Map<string, LinhaProduto>();
  for (const i of d.pedidos.flatMap((p) => p.itens ?? [])) {
    const k = i.produto?.sku ?? i.descricao ?? "—";
    const l = produtos.get(k) ?? { sku: i.produto?.sku ?? "—", nome: i.produto?.nome ?? i.descricao ?? "—", quantidade: 0, total: 0 };
    l.quantidade += Number(i.quantidade);
    l.total += Number(i.subtotal);
    produtos.set(k, l);
  }
  const linhas = [...produtos.values()].sort((a, b) => b.total - a.total);
  const conteudo: Content[] = [
    cabecalho(`Vendas — ${d.representada.nome} — ${rotulo}`, `CNPJ ${formatarDocumento(d.representada.cnpj)} · pedidos confirmados e entregues`),
    blocoResumo(r),
    secao("Por cliente"),
    tabelaGrupo("Cliente", agrupar(d.pedidos, (p) => p.cliente?.id ?? null, (p) => p.cliente?.nome ?? "—"), "Nenhuma venda no período.", r.total),
    secao("Por produto"),
    tabela(
      [
        { titulo: "SKU", valor: (l: LinhaProduto) => l.sku, largura: "auto" },
        { titulo: "Produto", valor: (l) => l.nome },
        { titulo: "Qtd.", valor: (l) => String(l.quantidade).replace(".", ","), alinhar: "right", largura: "auto" },
        { titulo: "Total", valor: (l) => formatarMoeda(l.total), alinhar: "right", largura: "auto" },
      ],
      linhas,
      { vazio: "Nenhum item vendido no período.", totais: ["Total", "", "", formatarMoeda(soma(linhas.map((l) => l.total)))] },
    ),
  ];
  return gerarPdf(conteudo, { titulo: `Vendas ${d.representada.nome} ${d.periodo}`, representante: rep });
}

/* ---------- 6. KPIs ---------- */

type OpKpi = { resultado: string | null; data_conclusao: string | null; criado_em: string; funil: { modelo: string } | null };
export type Kpis = {
  vendas: ReturnType<typeof resumo>;
  oportunidades: number | null; // % convertidas (ganhas ÷ ganhas + perdidas), null = sem decididas
  clientes: number | null; // % convertidos nos funis de prospecção, null = sem funil/oportunidades
};
export type DadosKpis = { periodo: string; anterior: string; temProspeccao: boolean; atual: Kpis; ant: Kpis };

const dentro = (iso: string | null, p: string) => {
  if (!iso) return false;
  const { inicio, fim } = limitesPeriodo(p);
  const t = Date.parse(iso);
  return t >= Date.parse(inicio) && t < Date.parse(fim);
};

/** Indicadores de um período (puro: testável). */
export function calcularKpis(pedidos: PedidoVenda[], ops: OpKpi[], periodo: string, temProspeccao: boolean): Kpis {
  const decididas = ops.filter((o) => o.resultado && dentro(o.data_conclusao, periodo));
  const ganhas = decididas.filter((o) => o.resultado === "ganhou").length;
  const prosp = ops.filter((o) => o.funil?.modelo === "prospeccao" && dentro(o.criado_em, periodo));
  return {
    vendas: resumo(pedidos.filter((p) => dentro(p.data, periodo))),
    oportunidades: decididas.length ? Math.round((ganhas / decididas.length) * 1000) / 10 : null,
    clientes: temProspeccao && prosp.length ? Math.round((prosp.filter((o) => o.resultado === "ganhou").length / prosp.length) * 1000) / 10 : null,
  };
}

export async function dadosKpis(ctx: Contexto, periodo: string): Promise<DadosKpis> {
  const anterior = periodoAnterior(periodo);
  const [pedAtual, pedAnt, ops, funis] = await Promise.all([
    pedidosVenda(ctx, periodo, {}, false),
    pedidosVenda(ctx, anterior, {}, false),
    ctx.supabase.from("oportunidades_desafios").select("resultado, data_conclusao, criado_em, funil:funis(modelo)").limit(5000).returns<OpKpi[]>(),
    ctx.supabase.from("funis").select("id", { count: "exact", head: true }).eq("modelo", "prospeccao"),
  ]);
  if (ops.error) throw erroBanco(ops.error);
  if (funis.error) throw erroBanco(funis.error);
  const temProspeccao = (funis.count ?? 0) > 0;
  const pedidos = [...pedAtual, ...pedAnt];
  return {
    periodo, anterior, temProspeccao,
    atual: calcularKpis(pedidos, ops.data, periodo, temProspeccao),
    ant: calcularKpis(pedidos, ops.data, anterior, temProspeccao),
  };
}

const variacaoTexto = (a: number | null, b: number | null, pontos = false) => {
  if (a == null || b == null) return "—";
  if (pontos) return `${a - b >= 0 ? "+" : ""}${(a - b).toFixed(1).replace(".", ",")} p.p.`;
  if (b === 0) return a === 0 ? "0,0%" : "—";
  const v = ((a - b) / b) * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;
};

export function pdfKpis(d: DadosKpis, rep?: Representante): Promise<Uint8Array> {
  const { rotulo } = limitesPeriodo(d.periodo);
  const { rotulo: rotuloAnt } = limitesPeriodo(d.anterior);
  type Linha = { nome: string; atual: string; anterior: string; variacao: string };
  const linhas: Linha[] = [
    { nome: "Vendas (total)", atual: formatarMoeda(d.atual.vendas.total), anterior: formatarMoeda(d.ant.vendas.total), variacao: variacaoTexto(d.atual.vendas.total, d.ant.vendas.total) },
    { nome: "Nº de pedidos", atual: String(d.atual.vendas.pedidos), anterior: String(d.ant.vendas.pedidos), variacao: variacaoTexto(d.atual.vendas.pedidos, d.ant.vendas.pedidos) },
    { nome: "Ticket médio", atual: formatarMoeda(d.atual.vendas.ticket), anterior: formatarMoeda(d.ant.vendas.ticket), variacao: variacaoTexto(d.atual.vendas.ticket, d.ant.vendas.ticket) },
    { nome: "% Oportunidades convertidas", atual: pct(d.atual.oportunidades), anterior: pct(d.ant.oportunidades), variacao: variacaoTexto(d.atual.oportunidades, d.ant.oportunidades, true) },
    {
      nome: "% Clientes convertidos (prospecção)",
      atual: d.temProspeccao ? pct(d.atual.clientes) : "—",
      anterior: d.temProspeccao ? pct(d.ant.clientes) : "—",
      variacao: d.temProspeccao ? variacaoTexto(d.atual.clientes, d.ant.clientes, true) : "—",
    },
  ];
  const conteudo: Content[] = [
    cabecalho(`KPIs — ${rotulo}`, `Comparado a ${rotuloAnt}`),
    indicadores([
      { rotulo: "Vendas", valor: formatarMoeda(d.atual.vendas.total) },
      { rotulo: "Ticket médio", valor: formatarMoeda(d.atual.vendas.ticket) },
      { rotulo: "Oport. convertidas", valor: pct(d.atual.oportunidades) },
      { rotulo: "Clientes convertidos", valor: d.temProspeccao ? pct(d.atual.clientes) : "—" },
    ]),
    secao("Indicadores do período"),
    tabela(
      [
        { titulo: "Indicador", valor: (l: Linha) => l.nome },
        { titulo: rotulo, valor: (l) => l.atual, alinhar: "right", largura: "auto" },
        { titulo: rotuloAnt, valor: (l) => l.anterior, alinhar: "right", largura: "auto" },
        { titulo: "Variação", valor: (l) => l.variacao, alinhar: "right", largura: "auto" },
      ],
      linhas,
    ),
    {
      text:
        "% Oportunidades convertidas = ganhas ÷ (ganhas + perdidas), pela data de conclusão. " +
        "% Clientes convertidos = oportunidades ganhas ÷ oportunidades criadas no período em funis de prospecção" +
        (d.temProspeccao ? "." : " (nenhum funil de prospecção cadastrado)."),
      style: "rotulo",
      margin: [0, 8, 0, 0],
    },
  ];
  return gerarPdf(conteudo, { titulo: `KPIs ${d.periodo}`, representante: rep });
}
