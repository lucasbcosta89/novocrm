import Link from "next/link";
import { Mensagens, type Busca } from "@/components/form";
import { TabelaPedidos } from "@/components/tabelas";
import { carregar } from "@/server/acao";
import { obterCliente } from "@/server/clientes";
import { listarPedidos } from "@/server/consultas";

export default async function ClientePedidos({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const [c, pedidos] = await carregar((ctx) => Promise.all([obterCliente(ctx, id), listarPedidos(ctx, { cliente_id: id })]));
  return (
    <>
      <Mensagens erro={erro} ok={ok} />
      <section className="card">
        <div className="cabecalho">
          <h2>Pedidos</h2>
          <Link className="btn btn-peq" href={`/app/pedidos/novo?cliente=${c.id}${c.representadas.length === 1 ? `&representada=${c.representadas[0]!.id}` : ""}`}>+ Novo pedido</Link>
        </div>
        <TabelaPedidos pedidos={pedidos} coluna="representada" />
      </section>
    </>
  );
}
