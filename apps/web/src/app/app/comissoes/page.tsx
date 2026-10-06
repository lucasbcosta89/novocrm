import Link from "next/link";
import { Mensagens } from "@/components/form";
import { formatarData, formatarMoeda, formatarPercentual } from "@/lib/formato";
import { ROTULO_STATUS_COMISSAO } from "@/lib/rotulos";
import { comParam } from "@/lib/url";
import { carregar } from "@/server/acao";
import { listarComissoes, resumirComissoes, type TotaisComissao } from "@/server/comissoes";
import { listarRepresentadas } from "@/server/representadas";
import { marcarComissaoAction } from "./actions";

const somar = (lista: { totais: TotaisComissao }[]): TotaisComissao =>
  lista.reduce(
    (t, r) => ({
      a_receber: t.a_receber + r.totais.a_receber,
      recebida: t.recebida + r.totais.recebida,
      atrasada: t.atrasada + r.totais.atrasada,
    }),
    { a_receber: 0, recebida: 0, atrasada: 0 },
  );

function Totais({ t }: { t: TotaisComissao }) {
  return (
    <dl className="resumo">
      <div><dt>A receber</dt><dd>{formatarMoeda(t.a_receber)}</dd></div>
      <div><dt>Recebida</dt><dd className="txt-ok">{formatarMoeda(t.recebida)}</dd></div>
      <div><dt>Atrasada</dt><dd className={t.atrasada > 0 ? "atrasada" : undefined}>{formatarMoeda(t.atrasada)}</dd></div>
    </dl>
  );
}

export default async function ComissoesPage({
  searchParams,
}: {
  searchParams: Promise<{ representada?: string; status?: string; erro?: string; ok?: string }>;
}) {
  const { representada, status, erro, ok } = await searchParams;
  const [todas, representadas] = await carregar((ctx) => Promise.all([listarComissoes(ctx), listarRepresentadas(ctx)]));
  const resumo = resumirComissoes(todas);
  const lista = todas.filter(
    (c) => (!representada || c.representada_id === representada) && (!status || c.status === status),
  );
  const atrasadas = todas.filter((c) => c.status === "atrasada");

  let voltar = "/app/comissoes";
  if (representada) voltar = comParam(voltar, "representada", representada);
  if (status) voltar = comParam(voltar, "status", status);

  return (
    <>
      <h1>Comissões</h1>
      <Mensagens erro={erro} ok={ok} />
      {atrasadas.length > 0 && (
        <p className="aviso aviso-erro alerta">
          ⚠ {atrasadas.length} comissão(ões) atrasada(s), total {formatarMoeda(atrasadas.reduce((s, c) => s + Number(c.valor), 0))}.{" "}
          <Link href="/app/comissoes?status=atrasada">Ver atrasadas</Link>
        </p>
      )}

      <section className="card">
        <h2>Resumo geral</h2>
        <Totais t={somar(resumo)} />
      </section>

      {resumo.length > 0 && (
        <div className="cards-resumo">
          {resumo.map((r) => (
            <section key={r.representada.id} className={`card ${r.totais.atrasada > 0 ? "card-alerta" : ""}`}>
              <h3><Link href={`/app/comissoes?representada=${r.representada.id}`}>{r.representada.nome}</Link></h3>
              <Totais t={r.totais} />
            </section>
          ))}
        </div>
      )}

      <section className="card">
        <h2>Lançamentos</h2>
        <form method="get" className="inline">
          <label className="campo">
            <span>Representada</span>
            <select name="representada" defaultValue={representada ?? ""}>
              <option value="">Todas</option>
              {representadas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Status</span>
            <select name="status" defaultValue={status ?? ""}>
              <option value="">Todos</option>
              {Object.entries(ROTULO_STATUS_COMISSAO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </label>
          <button className="btn btn-peq" type="submit">Filtrar</button>
        </form>

        {lista.length === 0 ? (
          <div className="vazio">Nenhuma comissão. Confirme um pedido para gerar comissões.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Pedido</th><th>Cliente</th><th>Representada</th><th>Valor pedido</th><th>% (média)</th><th>Comissão</th><th>Prevista</th><th>Status</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className={c.status === "atrasada" ? "linha-alerta" : undefined}>
                    <td>{c.pedido ? <Link href={`/app/pedidos/${c.pedido.id}`}>{c.pedido.numero}</Link> : "—"}</td>
                    <td>{c.pedido?.cliente?.nome ?? "—"}</td>
                    <td>{c.representada?.nome ?? "—"}</td>
                    <td>{c.pedido ? formatarMoeda(c.pedido.valor_total) : "—"}</td>
                    <td>{formatarPercentual(c.percentual)}</td>
                    <td><strong>{formatarMoeda(c.valor)}</strong></td>
                    <td>{c.data_prevista ? formatarData(c.data_prevista) : "—"}</td>
                    <td><span className={`etiqueta etiqueta-${c.status}`}>{ROTULO_STATUS_COMISSAO[c.status]}</span></td>
                    <td className="acoes-linha">
                      {c.status !== "recebida" && c.status !== "cancelada" && (
                        <form action={marcarComissaoAction.bind(null, c.id, "recebida", voltar)}>
                          <button className="btn btn-peq" type="submit">Marcar recebida</button>
                        </form>
                      )}
                      {c.status === "a_receber" && (
                        <form action={marcarComissaoAction.bind(null, c.id, "atrasada", voltar)}>
                          <button className="btn-link perigo" type="submit">Marcar atrasada</button>
                        </form>
                      )}
                      {(c.status === "recebida" || c.status === "atrasada") && (
                        <form action={marcarComissaoAction.bind(null, c.id, "a_receber", voltar)}>
                          <button className="btn-link" type="submit">Voltar a receber</button>
                        </form>
                      )}
                    </td>
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
