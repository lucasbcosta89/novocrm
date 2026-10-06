import Link from "next/link";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { ROTULO_STATUS_PEDIDO } from "@/lib/rotulos";
import type { PedidoResumo } from "@/server/consultas";

/** Lista de pedidos (somente leitura até a Fase 5). `coluna` = entidade relacionada a exibir. */
export function TabelaPedidos({ pedidos, coluna }: { pedidos: PedidoResumo[]; coluna: "cliente" | "representada" }) {
  if (pedidos.length === 0) return <div className="vazio">Nenhum pedido.</div>;
  return (
    <div className="tabela-wrap">
      <table className="tabela">
        <thead>
          <tr>
            <th>Nº</th><th>Data</th><th>{coluna === "cliente" ? "Cliente" : "Representada"}</th>
            <th>Status</th><th>Valor</th><th>Comissão</th>
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
                <td>{ROTULO_STATUS_PEDIDO[p.status] ?? p.status}</td>
                <td>{formatarMoeda(p.valor_total)}</td>
                <td>{formatarMoeda(p.comissao_total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
