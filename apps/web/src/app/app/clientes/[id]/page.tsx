import Link from "next/link";
import { Campo, Mensagens, type Busca } from "@/components/form";
import { TabelaPedidos } from "@/components/tabelas";
import { formatarDataHora, formatarDocumento, formatarMoeda, paraInputDataHora } from "@/lib/formato";
import { TIPOS_VISITA } from "@/lib/validacao";
import { carregar } from "@/server/acao";
import { obterCliente } from "@/server/clientes";
import { listarOportunidades, listarPedidos } from "@/server/consultas";
import { listarRepresentadas, type Representada } from "@/server/representadas";
import { listarVisitas, type Visita } from "@/server/visitas";
import {
  atualizarClienteAction,
  atualizarVisitaAction,
  criarVisitaAction,
  desvincularAction,
  excluirClienteAction,
  excluirVisitaAction,
  vincularUmaAction,
} from "../actions";
import { CamposCliente } from "../campos";

const ROTULO_TIPO: Record<string, string> = { presencial: "Presencial", telefone: "Telefone", whatsapp: "WhatsApp", video: "Vídeo" };

function CamposVisita({ v, representadas }: { v?: Visita; representadas: { id: string; nome: string }[] }) {
  return (
    <>
      <Campo label="Data/hora *" name="data" type="datetime-local" required defaultValue={paraInputDataHora(v?.data)} />
      <label className="campo">
        <span>Tipo</span>
        <select name="tipo" defaultValue={v?.tipo ?? "presencial"}>
          {TIPOS_VISITA.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
        </select>
      </label>
      <label className="campo">
        <span>Representada</span>
        <select name="representada_id" defaultValue={v?.representada_id ?? ""}>
          <option value="">—</option>
          {representadas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
      </label>
      <Campo label="Resultado" name="resultado" defaultValue={v?.resultado ?? ""} />
      <label className="campo campo-largo">
        <span>Anotações</span>
        <textarea name="anotacoes" rows={2} defaultValue={v?.anotacoes ?? ""} />
      </label>
    </>
  );
}

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Busca;
}) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const [c, todas, visitas, pedidos, oportunidades] = await carregar((ctx) =>
    Promise.all([
      obterCliente(ctx, id),
      listarRepresentadas(ctx),
      listarVisitas(ctx, id),
      listarPedidos(ctx, { cliente_id: id }),
      listarOportunidades(ctx, id),
    ]),
  );
  const vinculadas = new Set(c.representadas.map((r) => r.id));
  const naoVinculadas: Representada[] = todas.filter((r) => !vinculadas.has(r.id));

  return (
    <>
      <p className="trilha"><Link href="/app/clientes">Clientes</Link> /</p>
      <h1>{c.nome}</h1>
      <nav className="ancoras">
        <a href="#info">Informações</a><a href="#representadas">Representadas</a><a href="#visitas">Visitas</a>
        <a href="#pedidos">Pedidos</a><a href="#oportunidades">Oportunidades</a>
      </nav>
      <Mensagens erro={erro} ok={ok} />

      <section className="card" id="info">
        <h2>Informações</h2>
        <dl className="resumo">
          <div><dt>CPF/CNPJ</dt><dd>{formatarDocumento(c.documento)}</dd></div>
          <div><dt>Cidade/UF</dt><dd>{[c.cidade, c.uf].filter(Boolean).join("/") || "—"}</dd></div>
          <div><dt>WhatsApp</dt><dd>{c.whatsapp ?? c.celular ?? "—"}</dd></div>
          <div><dt>E-mail</dt><dd>{c.email ?? "—"}</dd></div>
          <div><dt>Segmento</dt><dd>{c.segmento ?? "—"}</dd></div>
        </dl>
        <details>
          <summary>Editar dados</summary>
          <form action={atualizarClienteAction.bind(null, c.id)} className="grade">
            <CamposCliente c={c} />
            <div className="acoes"><button className="btn" type="submit">Salvar</button></div>
          </form>
          <form action={excluirClienteAction.bind(null, c.id)}>
            <button className="btn-perigo" type="submit">Excluir cliente</button>
          </form>
        </details>
      </section>

      <section className="card" id="representadas">
        <h2>Representadas</h2>
        {todas.length === 0 ? (
          <p className="vazio">Cadastre uma <Link href="/app/representadas">representada</Link> primeiro.</p>
        ) : (
          <ul className="lista">
            {c.representadas.map((r) => (
              <li key={r.id}>
                <Link href={`/app/representadas/${r.id}`}>{r.nome}</Link>
                <form action={desvincularAction.bind(null, c.id, r.id)}>
                  <button className="btn-perigo btn-peq" type="submit">Desvincular</button>
                </form>
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

      <section className="card" id="visitas">
        <h2>Visitas</h2>
        <form action={criarVisitaAction.bind(null, c.id)} className="grade">
          <CamposVisita representadas={c.representadas} />
          <div className="acoes"><button className="btn" type="submit">Registrar visita</button></div>
        </form>
        {visitas.length === 0 ? (
          <div className="vazio">Nenhuma visita registrada.</div>
        ) : (
          <ul className="historico">
            {visitas.map((v) => (
              <li key={v.id}>
                <div>
                  <strong>{formatarDataHora(v.data)}</strong> · {ROTULO_TIPO[v.tipo] ?? v.tipo}
                  {v.representada && <> · {v.representada.nome}</>}
                </div>
                {v.resultado && <div><em>Resultado:</em> {v.resultado}</div>}
                {v.anotacoes && <div className="anotacao">{v.anotacoes}</div>}
                <details>
                  <summary>Editar</summary>
                  <form action={atualizarVisitaAction.bind(null, c.id, v.id)} className="grade">
                    <CamposVisita v={v} representadas={c.representadas} />
                    <div className="acoes"><button className="btn" type="submit">Salvar</button></div>
                  </form>
                  <form action={excluirVisitaAction.bind(null, c.id, v.id)}>
                    <button className="btn-perigo btn-peq" type="submit">Excluir visita</button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" id="pedidos">
        <h2>Pedidos</h2>
        <TabelaPedidos pedidos={pedidos} coluna="representada" />
      </section>

      <section className="card" id="oportunidades">
        <h2>Oportunidades e desafios</h2>
        {oportunidades.length === 0 ? (
          <div className="vazio">Nenhuma oportunidade ou desafio.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Tipo</th><th>Título</th><th>Representada</th><th>Prioridade</th><th>Status</th><th>Valor estimado</th></tr>
              </thead>
              <tbody>
                {oportunidades.map((o) => (
                  <tr key={o.id}>
                    <td>{o.tipo === "oportunidade" ? "Oportunidade" : "Desafio"}</td>
                    <td>{o.titulo}</td>
                    <td>{o.representada?.nome ?? "—"}</td>
                    <td>{o.prioridade}</td>
                    <td>{o.status}</td>
                    <td>{o.valor_estimado == null ? "—" : formatarMoeda(o.valor_estimado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
