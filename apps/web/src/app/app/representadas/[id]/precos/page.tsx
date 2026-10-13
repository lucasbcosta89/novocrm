import Link from "next/link";
import { formatarMoeda, formatarPercentual } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { listarTabelaPrecos } from "@/server/consultas";

export default async function RepresentadaPrecos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const precos = await carregar((ctx) => listarTabelaPrecos(ctx, id));
  return (
    <section className="card">
      <h2>Tabela de preços</h2>
      {precos.length === 0 ? (
        <div className="vazio">Sem preços cadastrados.</div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>Tabela</th><th>SKU</th><th>Produto</th><th>Preço</th><th>Desc. máx.</th></tr>
            </thead>
            <tbody>
              {precos.map((t) => (
                <tr key={t.id}>
                  <td>{t.cliente ? <Link href={`/app/clientes/${t.cliente.id}`}>{t.cliente.nome}</Link> : "Padrão"}</td>
                  <td><code>{t.produto?.sku}</code></td>
                  <td>{t.produto?.nome}</td>
                  <td>{formatarMoeda(t.preco)}</td>
                  <td>{formatarPercentual(t.desconto_max ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
