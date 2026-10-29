import "server-only";
import type { Content } from "pdfmake/interfaces";
import { formatarData, formatarDataHora, formatarDocumento, formatarMoeda, formatarPercentual } from "@/lib/formato";
import { cabecalho, COR, gerarPdf, indicadores, quebraPagina, secao, tabela, type Representante } from "@/lib/pdf";
import { ROTULO_STATUS_COMISSAO, ROTULO_STATUS_PEDIDO } from "@/lib/rotulos";
import { detectarTipoImagem } from "@/lib/imagem";
import { idSchema } from "@/lib/validacao";
import { lerArquivo } from "./armazenamento";
import type { Contexto } from "./contexto";
import { erroBanco } from "./erros";

/* ---------- período ---------- */

const DIA = 86_400_000;
const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const somarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);

/**
 * Período do relatório em horário de Brasília (UTC-3, sem horário de verão):
 * "2026-10" (mês) ou "2026-09-01_2026-10-15" (intervalo, datas inclusivas).
 */
export function limitesPeriodo(periodo: string): { inicio: string; fim: string; rotulo: string } {
  if (periodo.includes("_")) {
    const [de, ate] = periodo.split("_") as [string, string];
    return { inicio: `${de}T00:00:00-03:00`, fim: `${somarDias(ate, 1)}T00:00:00-03:00`, rotulo: `${ddmmaaaa(de)} a ${ddmmaaaa(ate)}` };
  }
  const [ano, mes] = periodo.split("-").map(Number) as [number, number];
  const prox = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const nomeMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(ano, mes - 1, 15)));
  const rotulo = `${nomeMes.charAt(0).toUpperCase()}${nomeMes.slice(1)}/${ano}`;
  return { inicio: `${periodo}-01T00:00:00-03:00`, fim: `${prox}-01T00:00:00-03:00`, rotulo };
}

/** Período anterior equivalente: mês anterior, ou intervalo de mesma duração imediatamente antes. */
export function periodoAnterior(periodo: string): string {
  if (periodo.includes("_")) {
    const [de, ate] = periodo.split("_") as [string, string];
    const dias = Math.round((Date.parse(ate) - Date.parse(de)) / DIA) + 1;
    return `${somarDias(de, -dias)}_${somarDias(de, -1)}`;
  }
  const [ano, mes] = periodo.split("-").map(Number) as [number, number];
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
}

type Rep = { id: string; nome: string; cnpj: string | null };

async function representada({ supabase }: Contexto, id: string): Promise<Rep> {
  const { data, error } = await supabase.from("representadas").select("id, nome, cnpj").eq("id", idSchema.parse(id)).single<Rep>();
  if (error) throw erroBanco(error);
  return data;
}

/* ---------- relatório mensal ---------- */

export type DadosMensal = {
  representada: Rep;
  periodo: string;
  visitas: { data: string; tipo: string; resultado: string | null; cliente: { nome: string } | null }[];
  pedidos: { codigo_pedido: string; data: string; status: string; valor_total: number; comissao_total: number; cliente_id: string; cliente: { nome: string } | null }[];
  comissoes: { valor: number; status: string }[];
  carteira: number;
};

export async function dadosMensal(ctx: Contexto, representadaId: string, periodo: string): Promise<DadosMensal> {
  const rep = await representada(ctx, representadaId);
  const { inicio, fim } = limitesPeriodo(periodo);
  const { supabase } = ctx;
  const [visitas, pedidos, comissoes, carteira] = await Promise.all([
    supabase.from("visitas").select("data, tipo, resultado, cliente:clientes(nome)")
      .eq("representada_id", rep.id).gte("data", inicio).lt("data", fim).order("data")
      .returns<DadosMensal["visitas"]>(),
    supabase.from("pedidos").select("codigo_pedido, data, status, valor_total, comissao_total, cliente_id, cliente:clientes(nome)")
      .eq("representada_id", rep.id).in("status", ["confirmado", "entregue"]).gte("data", inicio).lt("data", fim).order("data")
      .returns<DadosMensal["pedidos"]>(),
    supabase.from("comissoes").select("valor, status, pedido:pedidos!inner(data)")
      .eq("representada_id", rep.id).gte("pedido.data", inicio).lt("pedido.data", fim).neq("status", "cancelada")
      .returns<{ valor: number; status: string }[]>(),
    supabase.from("cliente_representada").select("id", { count: "exact", head: true }).eq("representada_id", rep.id),
  ]);
  for (const r of [visitas, pedidos, comissoes, carteira]) if (r.error) throw erroBanco(r.error);
  return {
    representada: rep,
    periodo,
    visitas: visitas.data ?? [],
    pedidos: pedidos.data ?? [],
    comissoes: (comissoes.data ?? []).map(({ valor, status }) => ({ valor, status })),
    carteira: carteira.count ?? 0,
  };
}

const soma = (xs: number[]) => Math.round(xs.reduce((s, x) => s + Number(x), 0) * 100) / 100;

/** Positivação = clientes da carteira com ≥1 pedido válido no período ÷ carteira. */
export function positivacao(d: Pick<DadosMensal, "pedidos" | "carteira">) {
  const positivados = new Set(d.pedidos.map((p) => p.cliente_id)).size;
  return { positivados, carteira: d.carteira, percentual: d.carteira ? Math.round((positivados / d.carteira) * 1000) / 10 : 0 };
}

/** Corpo do relatório mensal de uma representada (estrutura da Fase 7). */
function corpoMensal(d: DadosMensal): Content[] {
  const pos = positivacao(d);
  const totalPedidos = soma(d.pedidos.map((p) => p.valor_total));
  const porStatus = (s: string) => soma(d.comissoes.filter((c) => c.status === s).map((c) => c.valor));
  return [
    indicadores([
      { rotulo: "Visitas", valor: String(d.visitas.length) },
      { rotulo: "Pedidos", valor: String(d.pedidos.length) },
      { rotulo: "Vendido", valor: formatarMoeda(totalPedidos) },
      { rotulo: "Comissões", valor: formatarMoeda(soma(d.comissoes.map((c) => c.valor))) },
      { rotulo: "Positivação", valor: `${String(pos.percentual).replace(".", ",")}% (${pos.positivados}/${pos.carteira})` },
    ]),
    secao("Comissões do período"),
    tabela(
      [
        { titulo: "A receber", valor: (t: number[]) => formatarMoeda(t[0]!), alinhar: "right" },
        { titulo: "Recebida", valor: (t) => formatarMoeda(t[1]!), alinhar: "right" },
        { titulo: "Atrasada", valor: (t) => formatarMoeda(t[2]!), alinhar: "right" },
      ],
      [[porStatus("a_receber"), porStatus("recebida"), porStatus("atrasada")]],
    ),
    secao("Pedidos"),
    tabela(
      [
        { titulo: "Código", valor: (p: DadosMensal["pedidos"][number]) => p.codigo_pedido, largura: "auto" },
        { titulo: "Data", valor: (p) => formatarData(p.data), largura: "auto" },
        { titulo: "Cliente", valor: (p) => p.cliente?.nome ?? "—" },
        { titulo: "Status", valor: (p) => ROTULO_STATUS_PEDIDO[p.status] ?? p.status, largura: "auto" },
        { titulo: "Valor", valor: (p) => formatarMoeda(p.valor_total), alinhar: "right", largura: "auto" },
        { titulo: "Comissão", valor: (p) => formatarMoeda(p.comissao_total), alinhar: "right", largura: "auto" },
      ],
      d.pedidos,
      { vazio: "Nenhum pedido no período.", totais: ["Total", "", "", "", formatarMoeda(totalPedidos), formatarMoeda(soma(d.pedidos.map((p) => p.comissao_total)))] },
    ),
    secao("Visitas"),
    tabela(
      [
        { titulo: "Data", valor: (v: DadosMensal["visitas"][number]) => formatarDataHora(v.data), largura: "auto" },
        { titulo: "Cliente", valor: (v) => v.cliente?.nome ?? "—" },
        { titulo: "Tipo", valor: (v) => v.tipo, largura: "auto" },
        { titulo: "Resultado", valor: (v) => v.resultado ?? "—" },
      ],
      d.visitas,
      { vazio: "Nenhuma visita registrada no período." },
    ),
  ];
}

export function pdfMensal(d: DadosMensal, representante?: Representante): Promise<Uint8Array> {
  const { rotulo } = limitesPeriodo(d.periodo);
  const conteudo: Content[] = [
    cabecalho(`Relatório Mensal — ${rotulo}`, `${d.representada.nome} · CNPJ ${formatarDocumento(d.representada.cnpj)}`),
    ...corpoMensal(d),
  ];
  return gerarPdf(conteudo, { titulo: `Relatório mensal ${d.representada.nome} ${d.periodo}`, representante });
}

/** Relatório mensal geral (Fase 7c): uma seção por representada + totais gerais no fim. */
export function pdfMensalGeral(ds: DadosMensal[], periodo: string, representante?: Representante): Promise<Uint8Array> {
  const { rotulo } = limitesPeriodo(periodo);
  const conteudo: Content[] = [cabecalho(`Relatório Mensal (Geral) — ${rotulo}`, `${ds.length} representada(s)`)];
  ds.forEach((d, i) => {
    if (i > 0) conteudo.push(quebraPagina());
    conteudo.push(secaoRepresentada(d.representada), ...corpoMensal(d));
  });
  const pedidos = ds.flatMap((d) => d.pedidos);
  const comissoes = ds.flatMap((d) => d.comissoes);
  conteudo.push(
    secao("Totais gerais"),
    tabela(
      [
        { titulo: "Representada", valor: (d: DadosMensal) => d.representada.nome },
        { titulo: "Visitas", valor: (d) => d.visitas.length, alinhar: "right", largura: "auto" },
        { titulo: "Pedidos", valor: (d) => d.pedidos.length, alinhar: "right", largura: "auto" },
        { titulo: "Vendido", valor: (d) => formatarMoeda(soma(d.pedidos.map((p) => p.valor_total))), alinhar: "right", largura: "auto" },
        { titulo: "Comissões", valor: (d) => formatarMoeda(soma(d.comissoes.map((c) => c.valor))), alinhar: "right", largura: "auto" },
        { titulo: "Positivação", valor: (d) => `${String(positivacao(d).percentual).replace(".", ",")}%`, alinhar: "right", largura: "auto" },
      ],
      ds,
      {
        vazio: "Nenhuma representada.",
        totais: [
          "Total geral",
          ds.reduce((s, d) => s + d.visitas.length, 0),
          pedidos.length,
          formatarMoeda(soma(pedidos.map((p) => p.valor_total))),
          formatarMoeda(soma(comissoes.map((c) => c.valor))),
          "",
        ],
      },
    ),
  );
  return gerarPdf(conteudo, { titulo: `Relatório mensal geral ${periodo}`, representante });
}

/* ---------- relatório de comissões ---------- */

export type DadosComissoes = {
  representada: Rep;
  periodo: string;
  comissoes: {
    percentual: number;
    valor: number;
    status: string;
    data_prevista: string | null;
    pedido: { codigo_pedido: string; data: string; valor_total: number; cliente: { nome: string } | null };
  }[];
  /** Detalhe por produto: soma de pedido_itens.comissao_valor (snapshot da confirmação; nunca recalcula). */
  produtos: ProdutoComissao[];
};
export type ProdutoComissao = { sku: string; nome: string; quantidade: number; vendido: number; comissao: number };

type ItemComissaoRow = { quantidade: number; subtotal: number; comissao_valor: number; descricao: string | null; produto: { sku: string; nome: string } | null };

/** Itens de pedidos válidos do período agrupados por produto (comissão gravada no item). */
function agruparProdutos(itens: ItemComissaoRow[]): ProdutoComissao[] {
  const m = new Map<string, ProdutoComissao>();
  for (const i of itens) {
    const chave = i.produto?.sku ?? i.descricao ?? "—";
    const p = m.get(chave) ?? { sku: i.produto?.sku ?? "—", nome: i.produto?.nome ?? i.descricao ?? "—", quantidade: 0, vendido: 0, comissao: 0 };
    p.quantidade += Number(i.quantidade);
    p.vendido += Number(i.subtotal);
    p.comissao += Number(i.comissao_valor);
    m.set(chave, p);
  }
  return [...m.values()]
    .map((p) => ({ ...p, vendido: Math.round(p.vendido * 100) / 100, comissao: Math.round(p.comissao * 100) / 100 }))
    .sort((a, b) => b.comissao - a.comissao);
}

/** Só comissões de pedidos do período. */
export async function dadosComissoes(ctx: Contexto, representadaId: string, periodo: string): Promise<DadosComissoes> {
  const rep = await representada(ctx, representadaId);
  const { inicio, fim } = limitesPeriodo(periodo);
  const [com, itens] = await Promise.all([
    ctx.supabase
      .from("comissoes")
      .select("percentual, valor, status, data_prevista, pedido:pedidos!inner(codigo_pedido, data, valor_total, cliente:clientes(nome))")
      .eq("representada_id", rep.id)
      .gte("pedido.data", inicio)
      .lt("pedido.data", fim)
      .returns<DadosComissoes["comissoes"]>(),
    ctx.supabase
      .from("pedido_itens")
      .select("quantidade, subtotal, comissao_valor, descricao, produto:produtos(sku, nome), pedido:pedidos!inner(data, status, representada_id)")
      .eq("pedido.representada_id", rep.id)
      .in("pedido.status", ["confirmado", "entregue"])
      .gte("pedido.data", inicio)
      .lt("pedido.data", fim)
      .returns<ItemComissaoRow[]>(),
  ]);
  if (com.error) throw erroBanco(com.error);
  if (itens.error) throw erroBanco(itens.error);
  const comissoes = [...com.data].sort((a, b) => a.pedido.data.localeCompare(b.pedido.data));
  return { representada: rep, periodo, comissoes, produtos: agruparProdutos(itens.data) };
}

const validasComissoes = (d: DadosComissoes) => d.comissoes.filter((c) => c.status !== "cancelada");

/** Corpo do relatório de comissões de uma representada (estrutura da Fase 7). */
function corpoComissoes(d: DadosComissoes): Content[] {
  const validas = validasComissoes(d);
  const por = (s: string) => soma(validas.filter((c) => c.status === s).map((c) => c.valor));
  return [
    indicadores([
      { rotulo: "Total", valor: formatarMoeda(soma(validas.map((c) => c.valor))) },
      { rotulo: "A receber", valor: formatarMoeda(por("a_receber")) },
      { rotulo: "Recebida", valor: formatarMoeda(por("recebida")) },
      { rotulo: "Atrasada", valor: formatarMoeda(por("atrasada")) },
    ]),
    tabela(
      [
        { titulo: "Pedido", valor: (c: DadosComissoes["comissoes"][number]) => c.pedido.codigo_pedido, largura: "auto" },
        { titulo: "Data", valor: (c) => formatarData(c.pedido.data), largura: "auto" },
        { titulo: "Cliente", valor: (c) => c.pedido.cliente?.nome ?? "—" },
        { titulo: "Valor pedido", valor: (c) => formatarMoeda(c.pedido.valor_total), alinhar: "right", largura: "auto" },
        { titulo: "%", valor: (c) => formatarPercentual(c.percentual), alinhar: "right", largura: "auto" },
        { titulo: "Comissão", valor: (c) => formatarMoeda(c.valor), alinhar: "right", largura: "auto" },
        { titulo: "Prevista", valor: (c) => (c.data_prevista ? formatarData(c.data_prevista) : "—"), largura: "auto" },
        { titulo: "Status", valor: (c) => ROTULO_STATUS_COMISSAO[c.status] ?? c.status, largura: "auto" },
      ],
      d.comissoes,
      { vazio: "Nenhuma comissão no período.", totais: ["Total", "", "", "", "", formatarMoeda(soma(validas.map((c) => c.valor))), "", ""] },
    ),
    secao("Detalhe por produto"),
    tabelaProdutos(d.produtos),
  ];
}

/** Comissão por produto (pedido_itens.comissao_valor dos pedidos confirmados/entregues). */
function tabelaProdutos(produtos: ProdutoComissao[]): Content {
  return tabela(
    [
      { titulo: "SKU", valor: (p: ProdutoComissao) => p.sku, largura: "auto" },
      { titulo: "Produto", valor: (p) => p.nome },
      { titulo: "Qtd.", valor: (p) => String(p.quantidade).replace(".", ","), alinhar: "right", largura: "auto" },
      { titulo: "Vendido", valor: (p) => formatarMoeda(p.vendido), alinhar: "right", largura: "auto" },
      { titulo: "Comissão", valor: (p) => formatarMoeda(p.comissao), alinhar: "right", largura: "auto" },
    ],
    produtos,
    { vazio: "Nenhum item vendido no período.", totais: ["Total", "", "", formatarMoeda(soma(produtos.map((p) => p.vendido))), formatarMoeda(soma(produtos.map((p) => p.comissao)))] },
  );
}

export function pdfComissoes(d: DadosComissoes, representante?: Representante): Promise<Uint8Array> {
  const { rotulo } = limitesPeriodo(d.periodo);
  const conteudo: Content[] = [cabecalho(`Relatório de Comissões — ${rotulo}`, `${d.representada.nome} · pedidos do período`), ...corpoComissoes(d)];
  return gerarPdf(conteudo, { titulo: `Comissões ${d.representada.nome} ${d.periodo}`, paisagem: true, representante });
}

/** Relatório de comissões geral (Fase 7c): uma seção por representada + totais gerais no fim. */
export function pdfComissoesGeral(ds: DadosComissoes[], periodo: string, representante?: Representante): Promise<Uint8Array> {
  const { rotulo } = limitesPeriodo(periodo);
  const conteudo: Content[] = [cabecalho(`Relatório de Comissões (Geral) — ${rotulo}`, `${ds.length} representada(s) · pedidos do período`)];
  for (const d of ds) conteudo.push(secaoRepresentada(d.representada), ...corpoComissoes(d));
  const total = (d: DadosComissoes, s?: string) => soma(validasComissoes(d).filter((c) => !s || c.status === s).map((c) => c.valor));
  conteudo.push(
    secao("Totais gerais"),
    tabela(
      [
        { titulo: "Representada", valor: (d: DadosComissoes) => d.representada.nome },
        { titulo: "A receber", valor: (d) => formatarMoeda(total(d, "a_receber")), alinhar: "right", largura: "auto" },
        { titulo: "Recebida", valor: (d) => formatarMoeda(total(d, "recebida")), alinhar: "right", largura: "auto" },
        { titulo: "Atrasada", valor: (d) => formatarMoeda(total(d, "atrasada")), alinhar: "right", largura: "auto" },
        { titulo: "Total", valor: (d) => formatarMoeda(total(d)), alinhar: "right", largura: "auto" },
      ],
      ds,
      {
        vazio: "Nenhuma representada.",
        totais: [
          "Total geral",
          formatarMoeda(soma(ds.map((d) => total(d, "a_receber")))),
          formatarMoeda(soma(ds.map((d) => total(d, "recebida")))),
          formatarMoeda(soma(ds.map((d) => total(d, "atrasada")))),
          formatarMoeda(soma(ds.map((d) => total(d)))),
        ],
      },
    ),
  );
  conteudo.push(secao("Total por produto (todas as representadas)"), tabelaProdutos(ds.flatMap((d) => d.produtos).sort((a, b) => b.comissao - a.comissao)));
  return gerarPdf(conteudo, { titulo: `Comissões geral ${periodo}`, paisagem: true, representante });
}

/** Cabeçalho de seção de uma representada nos relatórios gerais. */
function secaoRepresentada(r: Rep): Content {
  return { text: r.nome, style: "titulo", fontSize: 14, margin: [0, 10, 0, 6] };
}

/** Todas as representadas do usuário (para os relatórios gerais). */
export async function idsRepresentadas({ supabase }: Contexto): Promise<string[]> {
  const { data, error } = await supabase.from("representadas").select("id").order("nome").returns<{ id: string }[]>();
  if (error) throw erroBanco(error);
  return data.map((r) => r.id);
}

/* ---------- catálogo ---------- */

export type ProdutoCatalogo = {
  sku: string;
  nome: string;
  descricao: string | null;
  unidade: string | null;
  categoria: string | null;
  imagem_url: string | null;
  preco: number;
};
export type DadosCatalogo = { marcas: { representada: Rep; produtos: ProdutoCatalogo[] }[] };

/** representadaId = "todas" gera um catálogo com uma seção (página) por marca. */
export async function dadosCatalogo(ctx: Contexto, representadaId: string): Promise<DadosCatalogo> {
  let q = ctx.supabase.from("representadas").select("id, nome, cnpj").order("nome");
  if (representadaId !== "todas") q = q.eq("id", idSchema.parse(representadaId));
  const { data: reps, error } = await q.returns<Rep[]>();
  if (error) throw erroBanco(error);

  const { data: produtos, error: e2 } = await ctx.supabase
    .from("produtos")
    .select("representada_id, sku, nome, descricao, unidade, categoria, imagem_url, preco, tabelas_preco(preco)")
    .in("representada_id", reps.map((r) => r.id))
    .eq("ativo", true)
    .is("tabelas_preco.cliente_id", null)
    .order("nome")
    .returns<(Omit<ProdutoCatalogo, "preco"> & { representada_id: string; preco: number; tabelas_preco: { preco: number }[] })[]>();
  if (e2) throw erroBanco(e2);

  return {
    marcas: reps.map((r) => ({
      representada: r,
      produtos: produtos
        .filter((p) => p.representada_id === r.id)
        .map(({ tabelas_preco, ...p }) => ({ ...p, preco: tabelas_preco[0]?.preco ?? p.preco }))
        .sort((a, b) => (a.categoria ?? "~").localeCompare(b.categoria ?? "~") || a.nome.localeCompare(b.nome)),
    })),
  };
}

const PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="80"><rect width="110" height="80" fill="${COR.fundo}"/><text x="55" y="44" font-size="9" fill="${COR.suave}" text-anchor="middle" font-family="Helvetica">sem imagem</text></svg>`;

/** Imagem do produto (R2/Storage) como data URL; null se ausente, inválida ou formato não suportado (webp). */
export async function imagemDataUrl(chave: string | null): Promise<string | null> {
  if (!chave) return null;
  const arq = await lerArquivo(chave).catch(() => null);
  if (!arq) return null;
  const bytes = new Uint8Array(arq.bytes);
  // imagem inválida/não suportada não derruba o catálogo: usa o placeholder
  const tipo = detectarTipoImagem(bytes);
  if (tipo !== "image/jpeg" && tipo !== "image/png") return null;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${tipo};base64,${btoa(bin)}`;
}

function cartao(p: ProdutoCatalogo, img: string | null): Content {
  return {
    stack: [
      img ? { image: img, fit: [110, 80], alignment: "center" } : { svg: PLACEHOLDER, width: 110, alignment: "center" },
      { text: p.nome, bold: true, margin: [0, 6, 0, 0] },
      { text: `SKU ${p.sku}${p.unidade ? ` · ${p.unidade}` : ""}`, fontSize: 7, color: COR.suave },
      ...(p.descricao ? [{ text: p.descricao, fontSize: 7, color: COR.suave, margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
      { text: formatarMoeda(p.preco), fontSize: 11, bold: true, color: COR.primaria, margin: [0, 4, 0, 0] },
    ],
    margin: [4, 4, 4, 12],
    unbreakable: true,
  };
}

export async function pdfCatalogo(d: DadosCatalogo, representante?: Representante): Promise<Uint8Array> {
  const conteudo: Content[] = [];
  for (const [i, marca] of d.marcas.entries()) {
    if (i > 0) conteudo.push(quebraPagina()); // uma página (ou mais) por marca
    conteudo.push(cabecalho(`Catálogo — ${marca.representada.nome}`, `${marca.produtos.length} produto(s) · preços de tabela padrão`));
    if (marca.produtos.length === 0) {
      conteudo.push({ text: "Nenhum produto ativo.", style: "vazio" });
      continue;
    }
    const imagens = await Promise.all(marca.produtos.map((p) => imagemDataUrl(p.imagem_url)));
    const grupos = new Map<string, number[]>();
    marca.produtos.forEach((p, idx) => {
      const g = p.categoria?.trim() || "Outros";
      grupos.set(g, [...(grupos.get(g) ?? []), idx]);
    });
    for (const [categoria, idxs] of grupos) {
      conteudo.push(secao(categoria));
      for (let k = 0; k < idxs.length; k += 4) {
        const linha = idxs.slice(k, k + 4).map((j) => cartao(marca.produtos[j]!, imagens[j] ?? null));
        while (linha.length < 4) linha.push({ text: "" });
        conteudo.push({ columns: linha, columnGap: 8 });
      }
    }
  }
  const nome = d.marcas.length === 1 ? d.marcas[0]!.representada.nome : "todas as marcas";
  return gerarPdf(conteudo, { titulo: `Catálogo ${nome}`, representante });
}
