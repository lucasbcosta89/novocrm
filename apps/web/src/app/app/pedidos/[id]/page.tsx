import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Mensagens, type Busca } from "@/components/form";
import { Icone } from "@/components/icones";
import { StatusPedido } from "@/components/status";
import { formatarData, formatarDataHora, formatarDocumento, formatarMoeda, formatarPercentual } from "@/lib/formato";
import { ROTULO_FORMA_PAGAMENTO, ROTULO_STATUS_COMISSAO } from "@/lib/rotulos";
import { carregar } from "@/server/acao";
import { obterCliente } from "@/server/clientes";
import { obterPedido } from "@/server/pedidos";
import { cancelarPedidoAction, confirmarPedidoAction, excluirPedidoAction } from "../actions";
import { confirmacaoPedidoAction } from "../../whatsapp-actions";

export default async function PedidoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const p = await carregar((ctx) => obterPedido(ctx, id));
  const cliente = p.cliente ? await carregar((ctx) => obterCliente(ctx, p.cliente!.id)) : null;
  const comissao = p.comissao[0];
  const editavel = p.status !== "cancelado" && comissao?.status !== "recebida";
  const descontoAcima = p.itens.some((i) => i.desconto_acima_max);

  return (
    <>
      <p className="trilha">
        {p.cliente && <><Link href={`/app/clientes/${p.cliente.id}/pedidos`}>{p.cliente.nome}</Link> / </>}
        {p.representada && <Link href={`/app/representadas/${p.representada.id}/pedidos`}>{p.representada.nome}</Link>}
      </p>
      <div className="cabecalho-pagina">
        <h1 className="titulo-icone"><Icone nome="carrinho" tamanho={24} /> Pedido {p.codigo_pedido} <StatusPedido status={p.status} /></h1>
        {editavel && <Link className="btn-suave" href={`/app/pedidos/${p.id}/editar`}><Icone nome="lapis" tamanho={16} /> Editar</Link>}
      </div>
      <Mensagens erro={erro} ok={ok} />
      {descontoAcima && <p className="aviso aviso-alerta" role="alert"><span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>Desconto Acima do Máximo Permitido</p>}

      {cliente && (
        <section className="card cliente-pedido">
          <div className="cliente-pedido-topo">
            <Avatar nome={cliente.nome} />
            <div>
              <Link className="cliente-pedido-nome" href={`/app/clientes/${cliente.id}`}>{cliente.nome}</Link>
              <p className="subtitulo">{[cliente.segmento, p.representada?.nome && `via ${p.representada.nome}`].filter(Boolean).join(" · ") || "Cliente"}</p>
            </div>
          </div>
          <dl className="resumo">
            <div><dt className="com-icone"><Icone nome="identidade" tamanho={16} /> CPF/CNPJ</dt><dd>{formatarDocumento(cliente.documento)}</dd></div>
            <div><dt className="com-icone"><Icone nome="whatsapp" tamanho={16} /> WhatsApp</dt><dd>{cliente.whatsapp ?? cliente.celular ?? "—"}</dd></div>
            <div><dt className="com-icone"><Icone nome="email" tamanho={16} /> E-mail</dt><dd>{cliente.email ?? "—"}</dd></div>
            <div><dt className="com-icone"><Icone nome="mapa" tamanho={16} /> Cidade/UF</dt><dd>{[cliente.cidade, cliente.uf].filter(Boolean).join("/") || "—"}</dd></div>
          </dl>
        </section>
      )}

      <section className="card">
        <dl className="resumo">
          <div><dt>Código do pedido</dt><dd>{p.codigo_pedido}{!p.codigo_gerado && <span className="dica"> (ERP externo)</span>}</dd></div>
          <div><dt>Nº interno</dt><dd>{p.numero}</dd></div>
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
                <form action={excluirPedidoAction.bind(null, p.id, p.cliente.id, `/app/pedidos/${p.id}`)}>
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
