import Link from "next/link";
import { Mensagens, type Busca } from "@/components/form";
import { Icone } from "@/components/icones";
import { BuscaPedidos, TabelaPedidos } from "@/components/tabelas";
import { carregar } from "@/server/acao";
import { listarPedidos } from "@/server/consultas";
import { podeImportar } from "@/server/importacao";

/** Todos os pedidos do usuário (os com pendência de importação aparecem em vermelho). */
export default async function PedidosPage({ searchParams }: { searchParams: Promise<Awaited<Busca> & { q?: string }> }) {
  const { erro, ok, q = "" } = await searchParams;
  const [pedidos, importar] = await carregar((ctx) => Promise.all([listarPedidos(ctx, undefined, q), podeImportar(ctx)]));
  const pendentes = pedidos.filter((p) => p.tem_pendencias).length;
  return (
    <>
      <div className="cabecalho-pagina">
        <h1 className="titulo-icone"><Icone nome="carrinho" tamanho={24} /> Pedidos</h1>
        <div className="acoes-linha">
          <Link className="btn" href="/app/pedidos/novo"><Icone nome="mais" tamanho={16} /> Novo pedido</Link>
          {/* ao terminar, "Ir para os Pedidos" volta para esta página, renderizada de novo no servidor (lista recarregada) */}
          {importar && <Link className="btn-secundario" href="/app/pedidos/importar"><Icone nome="arquivo" tamanho={16} /> Cadastrar Pedidos com Excel</Link>}
        </div>
      </div>
      <Mensagens erro={erro} ok={ok} />
      {pendentes > 0 && <p className="dica">{pendentes} pedido(s) importado(s) com pendências: abra cada um para resolver.</p>}
      <section className="card">
        <BuscaPedidos q={q} base="/app/pedidos" />
        <TabelaPedidos pedidos={pedidos} coluna="cliente" vazio={q ? "Nenhum pedido com esse código." : undefined} />
      </section>
    </>
  );
}
