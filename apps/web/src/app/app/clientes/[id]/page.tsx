import Link from "next/link";
import { Mensagens, type Busca } from "@/components/form";
import { carregar } from "@/server/acao";
import { obterCliente } from "@/server/clientes";
import { listarRepresentadas } from "@/server/representadas";
import { atualizarClienteAction, excluirClienteAction, vincularAction } from "../actions";
import { CamposCliente } from "../campos";

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Busca;
}) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const [c, representadas] = await carregar((ctx) => Promise.all([obterCliente(ctx, id), listarRepresentadas(ctx)]));
  const vinculadas = new Set(c.representadas.map((r) => r.id));

  return (
    <>
      <p className="trilha"><Link href="/app/clientes">Clientes</Link> /</p>
      <h1>{c.nome}</h1>
      <Mensagens erro={erro} ok={ok} />

      <section className="card">
        <h2>Representadas vinculadas</h2>
        {representadas.length === 0 ? (
          <p className="vazio">Cadastre uma <Link href="/app/representadas">representada</Link> primeiro.</p>
        ) : (
          <form action={vincularAction.bind(null, c.id)}>
            <div className="checks">
              {representadas.map((r) => (
                <label key={r.id} className="check">
                  <input type="checkbox" name="representada_ids" value={r.id} defaultChecked={vinculadas.has(r.id)} />
                  {r.nome}
                </label>
              ))}
            </div>
            <button className="btn" type="submit">Salvar vínculos</button>
          </form>
        )}
      </section>

      <section className="card">
        <h2>Dados</h2>
        <form action={atualizarClienteAction.bind(null, c.id)} className="grade">
          <CamposCliente c={c} />
          <div className="acoes"><button className="btn" type="submit">Salvar</button></div>
        </form>
        <form action={excluirClienteAction.bind(null, c.id)}>
          <button className="btn-perigo" type="submit">Excluir cliente</button>
        </form>
      </section>
    </>
  );
}
