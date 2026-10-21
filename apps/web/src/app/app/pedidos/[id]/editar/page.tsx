import Link from "next/link";
import { Mensagens, type Busca } from "@/components/form";
import { Icone } from "@/components/icones";
import { PagamentoPedido } from "@/components/pagamento-pedido";
import { StatusPedido } from "@/components/status";
import { carregar } from "@/server/acao";
import { listarTabelaPrecos } from "@/server/consultas";
import { obterPedido } from "@/server/pedidos";
import { listarProdutos } from "@/server/produtos";
import { editarPedidoAction } from "../../actions";
import { ItensEditaveis, type LinhaEdicao } from "./itens-editaveis";

/** Edição do pedido (rascunho ou confirmado): produtos, quantidades, preços, descontos, pagamento e prazo. */
export default async function EditarPedidoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, { erro }] = await Promise.all([params, searchParams]);
  const p = await carregar((ctx) => obterPedido(ctx, id));
  const comissaoRecebida = p.comissao.some((c) => c.status === "recebida");
  const bloqueio =
    p.status === "cancelado" ? "Pedido cancelado não pode ser editado." : comissaoRecebida ? "Comissão já recebida: este pedido não pode mais ser editado." : null;

  const [produtos, precos] = p.representada
    ? await carregar((ctx) => Promise.all([listarProdutos(ctx, p.representada!.id), listarTabelaPrecos(ctx, p.representada!.id)]))
    : [[], []];

  // Preço/desconto máximo do cliente sobrepõe o padrão (mesma regra do banco).
  const precoCliente = new Map(precos.filter((t) => t.cliente?.id === p.cliente?.id && t.produto).map((t) => [t.produto!.id, t] as const));
  const itemPorProduto = new Map(p.itens.filter((i) => i.produto_id).map((i) => [i.produto_id!, i] as const));

  // Itens do pedido primeiro, depois os demais produtos ativos da representada.
  const linhas: LinhaEdicao[] = produtos
    .filter((pr) => pr.ativo || itemPorProduto.has(pr.id))
    .map((pr) => {
      const item = itemPorProduto.get(pr.id);
      const tabela = precoCliente.get(pr.id);
      return {
        produto_id: pr.id,
        sku: pr.sku,
        nome: pr.nome,
        inativo: !pr.ativo,
        quantidade: item ? Number(item.quantidade) : 0,
        preco: item ? Number(item.preco_unitario) : Number(tabela?.preco ?? pr.preco),
        desconto: item ? Number(item.desconto_percentual) : 0,
        desconto_max: Number(tabela?.desconto_max ?? pr.desconto_max ?? 0),
      };
    })
    .sort((a, b) => Number(b.quantidade > 0) - Number(a.quantidade > 0) || a.nome.localeCompare(b.nome));

  return (
    <>
      <p className="trilha"><Link href={`/app/pedidos/${p.id}`}>Pedido {p.numero}</Link> /</p>
      <div className="cabecalho-pagina">
        <div>
          <h1 className="titulo-icone">Editar pedido {p.numero} <StatusPedido status={p.status} /></h1>
          <p className="subtitulo">{p.cliente?.nome ?? "—"} · {p.representada?.nome ?? "—"}</p>
        </div>
      </div>
      <Mensagens erro={erro} />

      {bloqueio ? (
        <p className="aviso aviso-erro"><span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>{bloqueio}</p>
      ) : (
        <form action={editarPedidoAction.bind(null, p.id)} className="card">
          <h2 className="titulo-icone"><Icone nome="pacote" tamanho={20} /> Itens</h2>
          {p.status !== "rascunho" && (
            <p className="aviso aviso-alerta">
              <span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>
              Pedido já confirmado: ao salvar, o valor e a comissão serão recalculados.
            </p>
          )}
          <ItensEditaveis linhas={linhas} />
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
