import Link from "next/link";
import { CodigoPedido } from "@/components/codigo-pedido";
import { Mensagens, type Busca } from "@/components/form";
import { Icone } from "@/components/icones";
import { PagamentoPedido } from "@/components/pagamento-pedido";
import { StatusPedido } from "@/components/status";
import { carregar } from "@/server/acao";
import { listarTabelaPrecos } from "@/server/consultas";
import { obterPedido } from "@/server/pedidos";
import { listarProdutos } from "@/server/produtos";
import { editarPedidoAction } from "../../actions";
import { ItensEditaveis, type LinhaEdicao } from "@/components/itens-editaveis";
import { ItensSemProduto } from "@/components/itens-sem-produto";
import { resolverDescontoMaximo } from "@/lib/desconto";
import { obterConfiguracaoPedidos } from "@/server/configuracao-pedidos";
import { CampoDataFaturamento } from "@/components/data-faturamento";
import { obterRepresentada } from "@/server/representadas";

/** Edição do pedido (rascunho ou confirmado): produtos, quantidades, preços, descontos, pagamento e prazo. */
export default async function EditarPedidoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams]);
  const p = await carregar((ctx) => obterPedido(ctx, id));
  const comissaoRecebida = p.comissao.some((c) => c.status === "recebida");
  const bloqueio =
    p.status === "cancelado" ? "Pedido cancelado não pode ser editado." : comissaoRecebida ? "Comissão já recebida: este pedido não pode mais ser editado." : null;

  const [produtos, precos, rep, config] = p.representada
    ? await carregar((ctx) => Promise.all([listarProdutos(ctx, p.representada!.id), listarTabelaPrecos(ctx, p.representada!.id), obterRepresentada(ctx, p.representada!.id), obterConfiguracaoPedidos(ctx)]))
    : [[], [], null, null];
  // 17.1: itens sem produto (pendência de vínculo) continuam editáveis e são preservados ao salvar
  const semProduto = p.itens.filter((i) => !i.produto_id).map((i) => ({
    id: i.id, descricao: i.descricao_informada ?? i.descricao ?? "", sku: i.sku_informado ?? i.sku_planilha ?? "",
    quantidade: Number(i.quantidade), preco: Number(i.preco_unitario), desconto: Number(i.desconto_percentual), acrescimo: Number(i.acrescimo_percentual),
  }));

  // Preço/desconto máximo do cliente sobrepõe o padrão (mesma regra do banco).
  const precoCliente = new Map(precos.filter((t) => t.cliente?.id === p.cliente?.id && t.produto).map((t) => [t.produto!.id, t] as const));
  const itemPorProduto = new Map(p.itens.filter((i) => i.produto_id).map((i) => [i.produto_id!, i] as const));

  // Itens do pedido primeiro, depois os demais produtos ativos da representada.
  const linhas: LinhaEdicao[] = produtos
    .filter((pr) => pr.ativo || itemPorProduto.has(pr.id))
    .map((pr) => {
      const item = itemPorProduto.get(pr.id);
      const tabela = precoCliente.get(pr.id);
      const precoTabela = Number(tabela?.preco ?? pr.preco);
      return {
        produto_id: pr.id,
        sku: pr.sku,
        nome: pr.nome,
        inativo: !pr.ativo,
        quantidade: item ? Number(item.quantidade) : 0,
        preco: item ? Number(item.preco_unitario) : precoTabela,
        desconto: item ? Number(item.desconto_percentual) : 0,
        acrescimo: item ? Number(item.acrescimo_percentual) : 0,
        desconto_max: resolverDescontoMaximo({ desconto_max: tabela?.desconto_max ?? pr.desconto_max }, rep, config),
        preco_catalogo: precoTabela,
        comissao_catalogo: pr.comissao == null ? null : Number(pr.comissao),
        comissao_item: item ? Number(item.comissao_percentual) : null,
        comissao_planilha: item && item.comissao_origem === "planilha" ? { valor: Number(item.comissao_valor), subtotal: Number(item.subtotal) } : null,
      };
    })
    .sort((a, b) => Number(b.quantidade > 0) - Number(a.quantidade > 0) || a.nome.localeCompare(b.nome));

  return (
    <>
      <p className="trilha"><Link href={`/app/pedidos/${p.id}`}>Pedido {p.codigo_pedido}</Link> /</p>
      <div className="cabecalho-pagina">
        <div>
          <h1 className="titulo-icone">Editar pedido {p.codigo_pedido} <StatusPedido status={p.status} /></h1>
          <p className="subtitulo">{p.cliente?.nome ?? "—"} · {p.representada?.nome ?? "—"}</p>
        </div>
      </div>
      <Mensagens erro={erro} />

      {bloqueio ? (
        <p className="aviso aviso-erro"><span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>{bloqueio}</p>
      ) : (
        <form action={editarPedidoAction.bind(null, p.id)} className="card">
          <div className="grade">
            <div className="bloco-codigo-pedido"><CodigoPedido pedidoId={p.id} atual={p.codigo_pedido} gerado={p.codigo_gerado} /></div>
            <CampoDataFaturamento valor={p.data_faturamento} dataPedido={p.data.slice(0, 10)} />
          </div>
          <h2 className="titulo-icone"><Icone nome="pacote" tamanho={20} /> Itens</h2>
          {p.status !== "rascunho" && (
            <p className="aviso aviso-alerta">
              <span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>
              Pedido já confirmado: ao salvar, o valor e a comissão serão recalculados.
            </p>
          )}
          <ItensEditaveis linhas={linhas} comAcrescimo
            avisos={rep ? {
              manual: p.origem !== "importacao", representadaId: rep.id,
              comissaoRepresentada: rep.comissao_percentual == null ? null : Number(rep.comissao_percentual),
              produtosSemComissao: produtos.filter((pr) => !(Number(pr.comissao ?? 0) > 0)).length,
            } : undefined} />
          <ItensSemProduto iniciais={semProduto} manual={p.origem !== "importacao"}
            comissaoRepresentada={rep?.comissao_percentual == null ? null : Number(rep.comissao_percentual)}
            descontoMax={resolverDescontoMaximo(null, rep, config)} />
          <h2 className="titulo-icone"><Icone nome="cartao" tamanho={20} /> Pagamento</h2>
          <div className="grade">
            <PagamentoPedido forma={p.forma_pagamento} prazoTipo={p.prazo_tipo} prazoDias={p.prazo_dias} />
          </div>
          <div className="acoes-linha">
            <button className="btn" type="submit"><Icone nome="check" tamanho={16} /> Salvar alterações</button>
            <Link className="btn-link" href={`/app/pedidos/${p.id}`}>Cancelar</Link>
          </div>
        </form>
      )}
    </>
  );
}
