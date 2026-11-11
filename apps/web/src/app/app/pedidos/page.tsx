import Link from "next/link";
import { Mensagens } from "@/components/form";
import { Icone } from "@/components/icones";
import { TabelaPedidos } from "@/components/tabelas";
import { filtrandoPedidos, urlPedidos } from "@/lib/filtro-pedidos";
import { carregar } from "@/server/acao";
import { listarClientes } from "@/server/clientes";
import { listarPedidosFiltrados } from "@/server/consultas";
import { podeImportar } from "@/server/importacao";

type Busca = Promise<Record<string, string | string[] | undefined>>;

/**
 * Todos os pedidos do usuário (os com pendência de importação aparecem em vermelho), com filtros por código,
 * cliente e período. A exportação (XLSX/CSV) leva exatamente a visão filtrada.
 */
export default async function PedidosPage({ searchParams }: { searchParams: Busca }) {
  const sp = await searchParams;
  const erro = typeof sp.erro === "string" ? sp.erro : undefined;
  const ok = typeof sp.ok === "string" ? sp.ok : undefined;
  const [{ pedidos, filtro: f, limitado }, clientes, importar] = await carregar((ctx) =>
    Promise.all([listarPedidosFiltrados(ctx, sp), listarClientes(ctx), podeImportar(ctx)]),
  );
  const pendentes = pedidos.filter((p) => p.tem_pendencias).length;
  const filtrando = filtrandoPedidos(f);
  const exportar = (formato: "xlsx" | "csv") => urlPedidos(f, "/api/pedidos/exportar", { formato });

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
        <form method="get" className="filtros-custos">
          <label className="campo">
            <span>Código do pedido</span>
            <input type="search" name="q" defaultValue={f.q} maxLength={40} placeholder="Ex.: P000012 ou código do ERP" />
          </label>
          <label className="campo">
            <span>Cliente</span>
            <select name="cliente" defaultValue={f.cliente ?? ""}>
              <option value="">Todos</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="campo"><span>De</span><input type="date" name="de" defaultValue={f.de ?? ""} /></label>
          <label className="campo"><span>Até</span><input type="date" name="ate" defaultValue={f.ate ?? ""} /></label>
          <div className="acoes-linha">
            <button className="btn-secundario btn-peq" type="submit"><Icone nome="filtro" tamanho={16} /> Filtrar</button>
            {filtrando && <Link className="btn-link" href="/app/pedidos">Limpar</Link>}
            {pedidos.length > 0 && (
              <>
                <a className="btn-suave btn-peq" href={exportar("xlsx")} download><Icone nome="download" tamanho={16} /> Exportar XLSX</a>
                <a className="btn-suave btn-peq" href={exportar("csv")} download><Icone nome="download" tamanho={16} /> Exportar CSV</a>
              </>
            )}
          </div>
        </form>
        <p className="dica">
          {pedidos.length} pedido(s){filtrando ? " com esses filtros" : ""}
          {limitado && " — mostrando os 200 mais recentes; refine os filtros ou exporte para ver todos (até 5.000)"}.
        </p>
        <TabelaPedidos pedidos={pedidos} coluna="cliente" vazio={filtrando ? "Nenhum pedido com esses filtros." : undefined} />
      </section>
    </>
  );
}
