import Link from "next/link";
import { Mensagens, type Busca } from "@/components/form";
import { Icone } from "@/components/icones";
import { StatusPedido } from "@/components/status";
import { formatarData, formatarDataHora, formatarMoeda, formatarPercentual } from "@/lib/formato";
import { ROTULO_FORMA_PAGAMENTO, ROTULO_STATUS_COMISSAO } from "@/lib/rotulos";
import { carregar } from "@/server/acao";
import { obterPedido } from "@/server/pedidos";
import { cancelarPedidoAction, confirmarPedidoAction, excluirPedidoAction } from "../actions";
import { confirmacaoPedidoAction } from "../../whatsapp-actions";

export default async function PedidoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const p = await carregar((ctx) => obterPedido(ctx, id));
  const comissao = p.comissao[0];
  const descontoAcima = p.itens.some((i) => i.desconto_acima_max);

  return (
    <>
      <p className="trilha">
        {p.cliente && <><Link href={`/app/clientes/${p.cliente.id}/pedidos`}>{p.cliente.nome}</Link> / </>}
        {p.representada && <Link href={`/app/representadas/${p.representada.id}/pedidos`}>{p.representada.nome}</Link>}
      </p>
      <h1 className="titulo-icone"><Icone nome="carrinho" tamanho={24} /> Pedido {p.numero} <StatusPedido status={p.status} /></h1>
      <Mensagens erro={erro} ok={ok} />
      {descontoAcima && <p className="aviso aviso-alerta" role="alert"><span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>Desconto Acima do Máximo Permitido</p>}

      <section className="card">
        <dl className="resumo">
          <div><dt>Data</dt><dd>{formatarDataHora(p.data)}</dd></div>
          <div><dt>Valor total</dt><dd>{formatarMoeda(p.valor_total)}</dd></div>
          <div><dt>Comissão total</dt><dd>{formatarMoeda(p.comissao_total)}</dd></div>
          <div><dt>Forma de pagamento</dt><dd>{p.forma_pagamento ? ROTULO_FORMA_PAGAMENTO[p.forma_pagamento] ?? p.forma_pagamento : "—"}</dd></div>
          <div><dt>Prazo</dt><dd>{p.prazo_tipo === "a_prazo" ? `${p.prazo_dias} dias` : "À vista"}</dd></div>
          <div><dt>Origem</dt><dd>{p.origem === "catalogo_web" ? "Catálogo digital" : p.origem === "whatsapp" ? "WhatsApp" : "App"}</dd></div>
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
        {p.observacoes && <p className="anotacao">Obs. do cliente: {p.observacoes}</p>}
        <div className="acoes-linha">
          {p.status !== "cancelado" && (
            <form action={confirmacaoPedidoAction.bind(null, p.id)}>
              <button className="btn btn-whatsapp btn-peq" type="submit"><Icone nome="whatsapp" tamanho={16} /> Enviar confirmação via WhatsApp</button>
            </form>
          )}
          {p.status === "rascunho" && (
            <>
              <form action={confirmarPedidoAction.bind(null, p.id)}>
                <button className="btn" type="submit"><Icone nome="check" tamanho={16} /> Confirmar pedido</button>
              </form>
              {p.cliente && (
                <form action={excluirPedidoAction.bind(null, p.id, p.cliente.id)}>
                  <button className="btn-link perigo" type="submit"><Icone nome="lixeira" tamanho={16} /> Excluir rascunho</button>
                </form>
              )}
            </>
          )}
          {p.status !== "rascunho" && p.status !== "cancelado" && (
            <form action={cancelarPedidoAction.bind(null, p.id)}>
              <button className="btn-perigo btn-peq" type="submit"><Icone nome="cancelado" tamanho={16} /> Cancelar pedido</button>
            </form>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="titulo-icone"><Icone nome="pacote" tamanho={20} /> Itens</h2>
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>SKU</th><th>Produto</th><th>Qtd.</th><th>Preço un.</th><th>Desconto (%)</th><th>Subtotal</th><th>Comissão %</th><th>Comissão R$</th></tr>
            </thead>
            <tbody>
              {p.itens.map((i) => (
                <tr key={i.id}>
                  <td><code>{i.produto?.sku ?? "—"}</code></td>
                  <td>{i.descricao}</td>
                  <td>{String(i.quantidade).replace(".", ",")}</td>
                  <td>{formatarMoeda(i.preco_unitario)}</td>
                  <td>
                    {formatarPercentual(i.desconto_percentual)}
                    {i.desconto_acima_max && <span className="txt-alerta com-dica" data-dica="Desconto Acima do Máximo Permitido" role="img" aria-label="Desconto Acima do Máximo Permitido"> <Icone nome="alerta" tamanho={14} /></span>}
                  </td>
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
