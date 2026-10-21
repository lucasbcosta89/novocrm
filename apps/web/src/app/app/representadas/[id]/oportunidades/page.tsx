import Link from "next/link";
import { ROTULO_PRIORIDADE, ROTULO_RESULTADO, ROTULO_STATUS_OPORTUNIDADE, ROTULO_TIPO_OPORTUNIDADE } from "@/lib/rotulos";
import { carregar } from "@/server/acao";
import { oportunidadesDaRepresentada } from "@/server/dashboards";
import { Icone } from "@/components/icones";

/** Oportunidades/desafios vinculados à representada (edição no kanban ou na página do cliente). */
export default async function RepresentadaOportunidades({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itens = await carregar((ctx) => oportunidadesDaRepresentada(ctx, id));
  return (
    <section className="card">
      <div className="cabecalho">
        <h2 className="titulo-icone"><Icone nome="documento" tamanho={20} /> Oportunidades</h2>
        <Link className="btn-suave btn-peq" href="/app/oportunidades">Abrir kanban</Link>
      </div>
      {itens.length === 0 ? (
        <div className="vazio">Nenhuma oportunidade vinculada a esta representada.</div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>Tipo</th><th>Título</th><th>Cliente</th><th>Prioridade</th><th>Status</th><th>Resultado</th></tr>
            </thead>
            <tbody>
              {itens.map((o) => (
                <tr key={o.id}>
                  <td><span className={`etiqueta etiqueta-${o.tipo}`}>{ROTULO_TIPO_OPORTUNIDADE[o.tipo] ?? o.tipo}</span></td>
                  <td>{o.cliente ? <Link href={`/app/clientes/${o.cliente.id}/oportunidades/${o.id}`}>{o.titulo}</Link> : <Link href="/app/oportunidades">{o.titulo}</Link>}</td>
                  <td>{o.cliente ? <Link href={`/app/clientes/${o.cliente.id}`}>{o.cliente.nome}</Link> : "—"}</td>
                  <td>{ROTULO_PRIORIDADE[o.prioridade] ?? o.prioridade}</td>
                  <td>{ROTULO_STATUS_OPORTUNIDADE[o.status] ?? o.status}</td>
                  <td>{o.resultado ? ROTULO_RESULTADO[o.resultado] : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
