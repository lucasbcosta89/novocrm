import Link from "next/link";
import { formatarData, formatarMoeda } from "@/lib/formato";
import type { PedidoResumo } from "@/server/consultas";
import { BotaoPedidoWhatsApp } from "./botao-pedido-whatsapp";
import { StatusPedido } from "./status";

/** Lista de pedidos (somente leitura até a Fase 5). `coluna` = entidade relacionada a exibir. */
/** whatsapp: na página do cliente, coluna de ações com o envio do pedido em PDF (Fase 12). */
export function TabelaPedidos({ pedidos, coluna, whatsapp }: {
  pedidos: PedidoResumo[]; coluna: "cliente" | "representada"; whatsapp?: { cliente: string; telefone: string | null };
}) {
  if (pedidos.length === 0) return <div className="vazio">Nenhum pedido.</div>;
  return (
    <div className="tabela-wrap">
      <table className="tabela">
        <thead>
          <tr>
            <th>Nº</th><th>Data</th><th>{coluna === "cliente" ? "Cliente" : "Representada"}</th>
            <th>Status</th><th className="num">Valor</th><th className="num">Comissão</th>{whatsapp && <th className="col-acoes">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => {
            const rel = p[coluna];
            return (
              <tr key={p.id}>
                <td><Link href={`/app/pedidos/${p.id}`}>{p.numero}</Link></td>
                <td>{formatarData(p.data)}</td>
                <td>{rel ? <Link href={`/app/${coluna === "cliente" ? "clientes" : "representadas"}/${rel.id}`}>{rel.nome}</Link> : "—"}</td>
                <td><StatusPedido status={p.status} /></td>
                <td className="num">{formatarMoeda(p.valor_total)}</td>
                <td className="num">{formatarMoeda(p.comissao_total)}</td>
                {whatsapp && (
                  <td className="col-acoes">
                    {p.status !== "cancelado" && <BotaoPedidoWhatsApp pedidoId={p.id} numero={p.numero} cliente={whatsapp.cliente} telefone={whatsapp.telefone} />}
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
