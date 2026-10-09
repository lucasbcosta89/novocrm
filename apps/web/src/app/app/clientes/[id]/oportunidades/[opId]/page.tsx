import Link from "next/link";
import { notFound } from "next/navigation";
import { Campo, Mensagens, type Busca } from "@/components/form";
import { formatarData, formatarDataHora, formatarMoeda, paraInputDataHora } from "@/lib/formato";
import {
  ROTULO_PRIORIDADE,
  ROTULO_STATUS_ACAO,
  ROTULO_STATUS_OPORTUNIDADE,
  ROTULO_TIPO_OPORTUNIDADE,
} from "@/lib/rotulos";
import { carregar } from "@/server/acao";
import { obterCliente } from "@/server/clientes";
import { obterOportunidade, type Acao } from "@/server/oportunidades";
import {
  atualizarAcaoAction,
  atualizarOportunidadeAction,
  criarAcaoAction,
  excluirAcaoAction,
  excluirOportunidadeAction,
} from "../../../actions";
import { CamposOportunidade, OPCOES_STATUS, Selecao } from "../../../campos-oportunidade";

function CamposAcao({ a }: { a?: Acao }) {
  return (
    <>
      <Campo label="Ação *" name="descricao" required minLength={2} defaultValue={a?.descricao} />
      <Campo label="Responsável" name="responsavel" defaultValue={a?.responsavel ?? ""} />
      <Campo label="Prazo" name="prazo" type="date" defaultValue={a?.prazo ?? ""} />
      {a && <Selecao label="Status" name="status" opcoes={ROTULO_STATUS_ACAO} valor={a.status} />}
    </>
  );
}

const hoje = () => paraInputDataHora().slice(0, 10);

export default async function PlanoAcaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; opId: string }>;
  searchParams: Busca;
}) {
  const [{ id, opId }, { erro, ok }] = await Promise.all([params, searchParams]);
  const [o, cliente] = await carregar((ctx) => Promise.all([obterOportunidade(ctx, opId), obterCliente(ctx, id)]));
  if (o.cliente_id !== cliente.id) notFound();

  const concluidas = o.acoes.filter((a) => a.status === "concluido").length;

  return (
    <>
      <p className="trilha">
        <Link href="/app/clientes">Clientes</Link> / <Link href={`/app/clientes/${cliente.id}#oportunidades`}>{cliente.nome}</Link> /
      </p>
      <h1>
        <span className={`etiqueta etiqueta-${o.tipo}`}>{ROTULO_TIPO_OPORTUNIDADE[o.tipo]}</span> {o.titulo}
      </h1>
      <Mensagens erro={erro} ok={ok} />

      <section className="card">
        <dl className="resumo">
          <div><dt>Status</dt><dd>{ROTULO_STATUS_OPORTUNIDADE[o.status] ?? o.status}</dd></div>
          <div><dt>Prioridade</dt><dd>{ROTULO_PRIORIDADE[o.prioridade] ?? o.prioridade}</dd></div>
          <div><dt>Valor estimado</dt><dd>{o.valor_estimado == null ? "—" : formatarMoeda(o.valor_estimado)}</dd></div>
          <div><dt>Representada</dt><dd>{o.representada?.nome ?? "—"}</dd></div>
          <div><dt>Criado em</dt><dd>{formatarDataHora(o.criado_em)}</dd></div>
        </dl>
        {o.descricao && <p className="anotacao">{o.descricao}</p>}
        <form action={atualizarOportunidadeAction.bind(null, cliente.id, o.id, "plano")} className="inline">
          <Selecao label="Atualizar status" name="status" opcoes={OPCOES_STATUS} valor={o.status} />
          <button className="btn btn-peq" type="submit">Salvar status</button>
        </form>
        <details>
          <summary>Editar item</summary>
          <form action={atualizarOportunidadeAction.bind(null, cliente.id, o.id, "plano")} className="grade">
            <CamposOportunidade o={o} representadas={cliente.representadas} />
            <div className="acoes"><button className="btn" type="submit">Salvar</button></div>
          </form>
          <form action={excluirOportunidadeAction.bind(null, cliente.id, o.id)}>
            <button className="btn-perigo btn-peq" type="submit">Excluir item</button>
          </form>
        </details>
      </section>

      <section className="card">
        <h2>Plano de ação ({concluidas}/{o.acoes.length} concluídas)</h2>
        {o.acoes.length === 0 ? (
          <div className="vazio">Nenhuma ação ainda.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {o.acoes.map((a) => {
                  const atrasada = a.status !== "concluido" && a.status !== "cancelado" && a.prazo != null && a.prazo < hoje();
                  return (
                    <tr key={a.id} className={a.status === "concluido" ? "concluida" : undefined}>
                      <td>{a.descricao}</td>
                      <td>{a.responsavel ?? "—"}</td>
                      <td className={atrasada ? "atrasada" : undefined}>{a.prazo ? formatarData(`${a.prazo}T12:00:00Z`) : "—"}</td>
                      <td>{ROTULO_STATUS_ACAO[a.status] ?? a.status}</td>
                      <td className="acoes-linha">
                        {a.status !== "concluido" ? (
                          <form action={atualizarAcaoAction.bind(null, cliente.id, o.id, a.id)}>
                            <input type="hidden" name="status" value="concluido" />
                            <button className="btn btn-peq" type="submit">Concluir</button>
                          </form>
                        ) : (
                          <form action={atualizarAcaoAction.bind(null, cliente.id, o.id, a.id)}>
                            <input type="hidden" name="status" value="nao_iniciado" />
                            <button className="btn-link" type="submit">Reabrir</button>
                          </form>
                        )}
                        <details>
                          <summary>Editar</summary>
                          <form action={atualizarAcaoAction.bind(null, cliente.id, o.id, a.id)} className="grade">
                            <CamposAcao a={a} />
                            <div className="acoes"><button className="btn" type="submit">Salvar</button></div>
                          </form>
                          <form action={excluirAcaoAction.bind(null, cliente.id, o.id, a.id)}>
                            <button className="btn-link perigo" type="submit">Excluir</button>
                          </form>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <h3>Adicionar ação</h3>
        <form action={criarAcaoAction.bind(null, cliente.id, o.id)} className="grade">
          <CamposAcao />
          <div className="acoes"><button className="btn" type="submit">Adicionar</button></div>
        </form>
      </section>
    </>
  );
}
