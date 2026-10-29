import Link from "next/link";
import { Mensagens, type Busca } from "@/components/form";
import { Icone } from "@/components/icones";
import { BuscaPedidos, TabelaPedidos } from "@/components/tabelas";
import { carregar } from "@/server/acao";
import { obterCliente } from "@/server/clientes";
import { listarPedidos } from "@/server/consultas";

export default async function ClientePedidos({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Awaited<Busca> & { q?: string }> }) {
  const [{ id }, { erro, ok, q = "" }] = await Promise.all([params, searchParams]);
  const [c, pedidos] = await carregar((ctx) => Promise.all([obterCliente(ctx, id), listarPedidos(ctx, { cliente_id: id }, q)]));
  return (
    <>
      <Mensagens erro={erro} ok={ok} />
      <section className="card">
        <div className="cabecalho">
          <h2 className="titulo-icone"><Icone nome="carrinho" tamanho={20} /> Pedidos</h2>
          <Link className="btn btn-peq" href={`/app/pedidos/novo?cliente=${c.id}${c.representadas.length === 1 ? `&representada=${c.representadas[0]!.id}` : ""}`}><Icone nome="mais" tamanho={16} /> Novo pedido</Link>
        </div>
        <BuscaPedidos q={q} base={`/app/clientes/${c.id}/pedidos`} />
        <TabelaPedidos pedidos={pedidos} coluna="representada" vazio={q ? "Nenhum pedido com esse código." : undefined} acoes={{ clienteId: c.id, cliente: c.nome, telefone: c.whatsapp ?? c.celular }} />
      </section>
    </>
  );
}
