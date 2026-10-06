import Link from "next/link";
import { Mensagens, type Busca } from "@/components/form";
import { formatarData, formatarDataHora, formatarMoeda, formatarPercentual } from "@/lib/formato";
import { ROTULO_STATUS_COMISSAO, ROTULO_STATUS_PEDIDO } from "@/lib/rotulos";
import { carregar } from "@/server/acao";
import { obterPedido } from "@/server/pedidos";
import { cancelarPedidoAction, confirmarPedidoAction, excluirPedidoAction } from "../actions";

export default async function PedidoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const p = await carregar((ctx) => obterPedido(ctx, id));
  const comissao = p.comissao[0];

  return (
    <>
      <p className="trilha">
        {p.cliente && <><Link href={`/app/clientes/${p.cliente.id}#pedidos`}>{p.cliente.nome}</Link> / </>}
        {p.representada && <Link href={`/app/representadas/${p.representada.id}#pedidos`}>{p.representada.nome}</Link>}
      </p>
      <h1>Pedido {p.numero} <span className={`etiqueta etiqueta-${p.status}`}>{ROTULO_STATUS_PEDIDO[p.status] ?? p.status}</span></h1>
      <Mensagens erro={erro} ok={ok} />

      <section className="card">
        <dl className="resumo">
          <div><dt>Data</dt><dd>{formatarDataHora(p.data)}</dd></div>
          <div><dt>Valor total</dt><dd>{formatarMoeda(p.valor_total)}</dd></div>
          <div><dt>Comissão total</dt><dd>{formatarMoeda(p.comissao_total)}</dd></div>
          <div><dt>Pagamento</dt><dd>{p.forma_pagamento ?? "—"}</dd></div>
          {comissao && (
            <div>
              <dt>Comissão</dt>
              <dd>
                <Link href="/app/comissoes">{ROTULO_STATUS_COMISSAO[comissao.status] ?? comissao.status}</Link>
                {comissao.data_prevista && <> · prevista {formatarData(comissao.data_prevista)}</>}
              </dd>
            </div>
          )}
        </dl>
        <div className="acoes-linha">
          {p.status === "rascunho" && (
            <>
              <form action={confirmarPedidoAction.bind(null, p.id)}>
                <button className="btn" type="submit">Confirmar pedido</button>
              </form>
              {p.cliente && (
                <form action={excluirPedidoAction.bind(null, p.id, p.cliente.id)}>
                  <button className="btn-link perigo" type="submit">Excluir rascunho</button>
                </form>
              )}
            </>
          )}
          {p.status !== "rascunho" && p.status !== "cancelado" && (
            <form action={cancelarPedidoAction.bind(null, p.id)}>
              <button className="btn-perigo btn-peq" type="submit">Cancelar pedido</button>
            </form>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Itens</h2>
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>SKU</th><th>Produto</th><th>Qtd.</th><th>Preço un.</th><th>Desconto</th><th>Subtotal</th><th>Comissão %</th><th>Comissão R$</th></tr>
            </thead>
            <tbody>
              {p.itens.map((i) => (
                <tr key={i.id}>
                  <td><code>{i.produto?.sku ?? "—"}</code></td>
                  <td>{i.descricao}</td>
                  <td>{String(i.quantidade).replace(".", ",")}</td>
                  <td>{formatarMoeda(i.preco_unitario)}</td>
                  <td>{formatarMoeda(i.desconto)}</td>
                  <td>{formatarMoeda(i.subtotal)}</td>
                  <td>{formatarPercentual(i.comissao_percentual)}</td>
                  <td>{p.status === "rascunho" ? <span className="dica">ao confirmar</span> : formatarMoeda(i.comissao_valor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={5}>Total</th>
                <th>{formatarMoeda(p.valor_total)}</th>
                <th>{p.valor_total > 0 && p.status !== "rascunho" ? formatarPercentual(Math.round((p.comissao_total / p.valor_total) * 10000) / 100) : ""}</th>
                <th>{p.status === "rascunho" ? "—" : formatarMoeda(p.comissao_total)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}
