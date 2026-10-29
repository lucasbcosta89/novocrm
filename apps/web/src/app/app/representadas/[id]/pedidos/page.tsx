import Link from "next/link";
import { Icone } from "@/components/icones";
import { BuscaPedidos, TabelaPedidos } from "@/components/tabelas";
import { carregar } from "@/server/acao";
import { listarPedidos } from "@/server/consultas";

export default async function RepresentadaPedidos({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const [{ id }, { q = "" }] = await Promise.all([params, searchParams]);
  const pedidos = await carregar((ctx) => listarPedidos(ctx, { representada_id: id }, q));
  return (
    <section className="card">
      <div className="cabecalho">
        <h2 className="titulo-icone"><Icone nome="carrinho" tamanho={20} /> Pedidos</h2>
        <Link className="btn btn-peq" href={`/app/pedidos/novo?representada=${id}`}><Icone nome="mais" tamanho={16} /> Novo pedido</Link>
      </div>
      <BuscaPedidos q={q} base={`/app/representadas/${id}/pedidos`} />
      <TabelaPedidos pedidos={pedidos} coluna="cliente" vazio={q ? "Nenhum pedido com esse código." : undefined} />
    </section>
  );
}
