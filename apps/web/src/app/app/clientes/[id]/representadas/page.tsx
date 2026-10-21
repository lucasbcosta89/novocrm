import Link from "next/link";
import { EnviarCatalogo } from "@/components/enviar-catalogo";
import { Mensagens, type Busca } from "@/components/form";
import { Icone } from "@/components/icones";
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
        <h2 className="titulo-icone"><Icone nome="predio" tamanho={20} /> Representadas</h2>
        {todas.length === 0 ? (
          <p className="vazio">Cadastre uma <Link href="/app/representadas">representada</Link> primeiro.</p>
        ) : (
          <ul className="lista">
            {c.representadas.map((r) => (
              <li key={r.id}>
                <span className="com-icone"><Icone nome="predio" tamanho={16} /><Link href={`/app/representadas/${r.id}`}>{r.nome}</Link></span>
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
                  <button className="btn-suave btn-peq" type="submit"><Icone nome="link" tamanho={16} /> Vincular</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
