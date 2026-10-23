import "server-only";
import type { Content, TableCell } from "pdfmake/interfaces";
import { formatarMoeda } from "@/lib/formato";
import { COR, cabecalho, gerarPdf, type Representante } from "@/lib/pdf";
import { ROTULO_FORMA_PAGAMENTO } from "@/lib/rotulos";
import { idSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";
import { imagemDataUrl } from "./relatorios";

/** PDF do pedido (Fase 12): uma linha por item, com foto, no template da Fase 7b. */

export type ItemPdf = {
  produto_id: string | null; descricao: string | null; quantidade: number; preco_unitario: number;
  desconto_percentual: number; subtotal: number;
  produto: { sku: string; nome: string; ncm: string | null; imagem_url: string | null } | null;
};
export type DadosPedidoPdf = {
  id: string; numero: string; data: string; status: string; valor_total: number;
  forma_pagamento: string | null; prazo_tipo: string; prazo_dias: number | null;
  cliente: { id: string; nome: string; whatsapp: string | null; celular: string | null } | null;
  representada: { nome: string } | null;
  itens: ItemPdf[];
};

export async function dadosPedidoPdf({ supabase }: Contexto, pedidoId: string): Promise<DadosPedidoPdf> {
  const { data, error } = await supabase
    .from("pedidos")
    .select(
      `id, numero, data, status, valor_total, forma_pagamento, prazo_tipo, prazo_dias,
       cliente:clientes(id, nome, whatsapp, celular), representada:representadas(nome),
       itens:pedido_itens(produto_id, descricao, quantidade, preco_unitario, desconto_percentual, subtotal, produto:produtos(sku, nome, ncm, imagem_url))`,
    )
    .eq("id", idSchema.parse(pedidoId))
    .maybeSingle<DadosPedidoPdf>();
  if (error) throw erroBanco(error);
  if (!data) throw new AppError(404, "Pedido não encontrado", "nao_encontrado");
  return data;
}

const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const qtd = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const pctBR = (n: number) => `${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;

/**
 * Fotos: uma busca por produto (cache durante a geração); sem foto, foto inválida ou webp → célula vazia.
 * Miniatura de 40x40 no PDF.
 */
async function fotosDosItens(itens: ItemPdf[]): Promise<Map<string, string | null>> {
  const cache = new Map<string, Promise<string | null>>();
  for (const i of itens) {
    const chave = i.produto?.imagem_url;
    if (chave && !cache.has(chave)) cache.set(chave, imagemDataUrl(chave).catch(() => null));
  }
  const fotos = new Map<string, string | null>();
  for (const [chave, p] of cache) fotos.set(chave, await p);
  return fotos;
}

/** Corpo da tabela: cabeçalho, uma linha por item e "TOTAL DO PEDIDO" (puro: testável). */
export function tabelaItensPedido(d: Pick<DadosPedidoPdf, "itens" | "valor_total">, fotos: Map<string, string | null>) {
  const comDesconto = d.itens.some((i) => Number(i.desconto_percentual) > 0);
  const th = (text: string, alignment: "left" | "right" | "center" = "left"): TableCell => ({ text, style: "th", alignment });
  const cabecalhoTabela: TableCell[] = [
    th("Foto", "center"), th("Código/SKU"), th("Produto"), th("NCM"), th("Qtd.", "right"), th("Valor unit.", "right"),
    ...(comDesconto ? [th("Desc. %", "right")] : []), th("Valor total", "right"),
  ];
  const linhas: TableCell[][] = d.itens.map((i) => {
    const foto = i.produto?.imagem_url ? fotos.get(i.produto.imagem_url) : null;
    return [
      foto ? { image: foto, fit: [40, 40], alignment: "center" } : { text: "" },
      { text: i.produto?.sku ?? "—" },
      { text: i.produto?.nome ?? i.descricao ?? "—" },
      { text: i.produto?.ncm ?? "—" },
      { text: qtd(i.quantidade), alignment: "right" },
      { text: formatarMoeda(Number(i.preco_unitario)), alignment: "right" },
      ...(comDesconto ? [{ text: Number(i.desconto_percentual) > 0 ? pctBR(i.desconto_percentual) : "—", alignment: "right" } as TableCell] : []),
      { text: formatarMoeda(Number(i.subtotal)), alignment: "right" },
    ];
  });
  const colunas = cabecalhoTabela.length;
  const total: TableCell[] = [
    { text: "TOTAL DO PEDIDO", bold: true, fontSize: 11, colSpan: colunas - 1, alignment: "right" },
    ...Array.from({ length: colunas - 2 }, () => ({ text: "" })),
    { text: formatarMoeda(Number(d.valor_total)), bold: true, fontSize: 12, color: COR.primaria, alignment: "right" },
  ];
  return { comDesconto, body: [cabecalhoTabela, ...linhas, total] };
}

export async function pdfPedido(d: DadosPedidoPdf, representante?: Representante): Promise<Uint8Array> {
  const { comDesconto, body } = tabelaItensPedido(d, await fotosDosItens(d.itens));

  const pagamento: string[] = [];
  if (d.forma_pagamento) pagamento.push(`Forma de pagamento: ${ROTULO_FORMA_PAGAMENTO[d.forma_pagamento] ?? d.forma_pagamento}`);
  if (d.prazo_tipo === "a_prazo" && d.prazo_dias) pagamento.push(`Prazo: À prazo — ${d.prazo_dias} dias`);
  else if (d.prazo_tipo === "a_vista") pagamento.push("Prazo: À vista");

  const conteudo: Content[] = [
    cabecalho(`Pedido nº ${d.numero} — ${d.cliente?.nome ?? "Cliente"}`, `${d.representada?.nome ?? ""} · ${dataBR(d.data)}`),
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: [44, "auto", "*", "auto", "auto", "auto", ...(comDesconto ? ["auto" as const] : []), "auto"],
        body,
      },
      layout: {
        fillColor: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length - 1 ? COR.fundo : null),
        hLineColor: () => COR.borda,
        vLineWidth: () => 0,
        hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      style: "tabela",
    },
    ...(pagamento.length ? [{ text: pagamento.join("   ·   "), margin: [0, 6, 0, 0] as [number, number, number, number] }] : []),
  ];
  return gerarPdf(conteudo, { titulo: `Pedido ${d.numero}`, representante });
}
