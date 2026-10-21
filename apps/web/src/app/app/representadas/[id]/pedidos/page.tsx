import Link from "next/link";
import { Icone } from "@/components/icones";
import { TabelaPedidos } from "@/components/tabelas";
import { carregar } from "@/server/acao";
import { listarPedidos } from "@/server/consultas";

export default async function RepresentadaPedidos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pedidos = await carregar((ctx) => listarPedidos(ctx, { representada_id: id }));
  return (
    <section className="card">
      <div className="cabecalho">
        <h2 className="titulo-icone"><Icone nome="carrinho" tamanho={20} /> Pedidos</h2>
        <Link className="btn btn-peq" href={`/app/pedidos/novo?representada=${id}`}><Icone nome="mais" tamanho={16} /> Novo pedido</Link>
      </div>
      <TabelaPedidos pedidos={pedidos} coluna="cliente" />
    </section>
  );
}
