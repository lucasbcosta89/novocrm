import Link from "next/link";
import { EnviarCatalogo } from "@/components/enviar-catalogo";
import { Mensagens, type Busca } from "@/components/form";
import { carregar } from "@/server/acao";
import { obterCliente } from "@/server/clientes";
import { listarRepresentadas } from "@/server/representadas";
import { desvincularAction, vincularUmaAction } from "../../actions";

/** Vínculos do cliente com representadas (+ envio do catálogo por WhatsApp em nova aba). */
export default async function ClienteRepresentadas({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const [c, todas] = await carregar((ctx) => Promise.all([obterCliente(ctx, id), listarRepresentadas(ctx)]));
  const vinculadas = new Set(c.representadas.map((r) => r.id));
  const naoVinculadas = todas.filter((r) => !vinculadas.has(r.id));

  return (
    <>
      <Mensagens erro={erro} ok={ok} />
      <section className="card">
        <h2>Representadas</h2>
        {todas.length === 0 ? (
          <p className="vazio">Cadastre uma <Link href="/app/representadas">representada</Link> primeiro.</p>
        ) : (
          <ul className="lista">
            {c.representadas.map((r) => (
              <li key={r.id}>
                <Link href={`/app/representadas/${r.id}`}>{r.nome}</Link>
                <span className="acoes-linha">
                  <EnviarCatalogo representadaId={r.id} clienteId={c.id} rotulo="Enviar catálogo" compacto />
                  <form action={desvincularAction.bind(null, c.id, r.id)}>
                    <button className="btn-perigo btn-peq" type="submit">Desvincular</button>
                  </form>
                </span>
              </li>
            ))}
            {naoVinculadas.map((r) => (
              <li key={r.id} className="inativo">
                <span>{r.nome}</span>
                <form action={vincularUmaAction.bind(null, c.id, r.id)}>
                  <button className="btn btn-peq" type="submit">Vincular</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
