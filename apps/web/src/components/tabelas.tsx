import Link from "next/link";
import { formatarData, formatarMoeda } from "@/lib/formato";
import type { PedidoResumo } from "@/server/consultas";
import { excluirPedidoAction } from "@/app/app/pedidos/actions";
import { BotaoConfirmar } from "./botao-confirmar";
import { BotaoPedidoWhatsApp } from "./botao-pedido-whatsapp";
import { Icone } from "./icones";
import { StatusPedido } from "./status";

/** Lista de pedidos (somente leitura até a Fase 5). `coluna` = entidade relacionada a exibir. */
/**
 * acoes (página do cliente): coluna com botões só de ícone — enviar por WhatsApp (Fase 12),
 * editar e excluir o pedido.
 */
export function TabelaPedidos({ pedidos, coluna, acoes }: {
  pedidos: PedidoResumo[]; coluna: "cliente" | "representada"; acoes?: { clienteId: string; cliente: string; telefone: string | null };
}) {
  if (pedidos.length === 0) return <div className="vazio">Nenhum pedido.</div>;
  return (
    <div className="tabela-wrap">
      <table className={acoes ? "tabela tabela-pedidos" : "tabela"}>
        <thead>
          <tr>
            <th>Nº</th><th>Data</th><th>{coluna === "cliente" ? "Cliente" : "Representada"}</th>
            <th>Status</th><th className="num">Valor</th><th className="num">Comissão</th>{acoes && <th className="col-acoes">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => {
            const rel = p[coluna];
            return (
              <tr key={p.id}>
                <td data-rotulo="Nº"><Link href={`/app/pedidos/${p.id}`}>{p.numero}</Link></td>
                <td data-rotulo="Data">{formatarData(p.data)}</td>
                <td data-rotulo={coluna === "cliente" ? "Cliente" : "Representada"}>{rel ? <Link href={`/app/${coluna === "cliente" ? "clientes" : "representadas"}/${rel.id}`}>{rel.nome}</Link> : "—"}</td>
                <td data-rotulo="Status"><StatusPedido status={p.status} /></td>
                <td className="num" data-rotulo="Valor">{formatarMoeda(p.valor_total)}</td>
                <td className="num" data-rotulo="Comissão">{formatarMoeda(p.comissao_total)}</td>
                {acoes && (
                  <td className="col-acoes" data-rotulo="Ações">
                    <span className="acoes-icones">
                      {p.status !== "cancelado" && <BotaoPedidoWhatsApp pedidoId={p.id} numero={p.numero} cliente={acoes.cliente} telefone={acoes.telefone} />}
                      {p.status !== "cancelado" && (
                        <span className="com-dica" data-dica="Editar pedido">
                          <Link className="botao-icone botao-acao" href={`/app/pedidos/${p.id}/editar`} aria-label={`Editar pedido ${p.numero}`}>
                            <Icone nome="lapis" tamanho={17} />
                          </Link>
                        </span>
                      )}
                      <form action={excluirPedidoAction.bind(null, p.id, acoes.clienteId, `/app/clientes/${acoes.clienteId}/pedidos`)}>
                        <BotaoConfirmar
                          className="botao-icone botao-acao botao-excluir"
                          icone={<Icone nome="lixeira" tamanho={17} />}
                          rotulo="Excluir pedido"
                          pergunta={`Excluir o pedido nº ${p.numero}?${p.status === "rascunho" ? "" : " A comissão lançada para ele também será apagada."} Esta ação não pode ser desfeita.`}
                        />
                      </form>
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
