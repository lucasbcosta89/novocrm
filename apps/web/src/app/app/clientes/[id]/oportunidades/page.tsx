import Link from "next/link";
import { Mensagens, type Busca } from "@/components/form";
import { AvisoLimite } from "@/components/limite";
import { formatarData } from "@/lib/formato";
import { ROTULO_PRIORIDADE, ROTULO_TIPO_OPORTUNIDADE } from "@/lib/rotulos";
import { carregar } from "@/server/acao";
import { obterCliente } from "@/server/clientes";
import { listarOportunidades } from "@/server/oportunidades";
import { obterUso } from "@/server/quota";
import { atualizarOportunidadeAction, criarOportunidadeAction, excluirOportunidadeAction } from "../../actions";
import { CamposOportunidade, OPCOES_STATUS, Selecao } from "../../campos-oportunidade";

/** Oportunidades e desafios do cliente (Fase 4) — plano de ação em /oportunidades/[opId]. */
export default async function ClienteOportunidades({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const [c, oportunidades, uso] = await carregar((ctx) => Promise.all([obterCliente(ctx, id), listarOportunidades(ctx, id), obterUso(ctx)]));

  return (
    <>
      <Mensagens erro={erro} ok={ok} />
      <section className="card">
        <h2>Oportunidades e desafios</h2>
        <AvisoLimite uso={uso} recurso="oportunidades" />
        <details className="novo">
          <summary className="btn btn-peq" title="Novo item">+ Novo</summary>
          <form action={criarOportunidadeAction.bind(null, c.id)} className="grade">
            <CamposOportunidade representadas={c.representadas} />
            <div className="acoes"><button className="btn" type="submit" disabled={uso.recursos.oportunidades.atingido}>Criar</button></div>
          </form>
        </details>
        {oportunidades.length === 0 ? (
          <div className="vazio">Nenhuma oportunidade ou desafio.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Tipo</th><th>Título</th><th>Prioridade</th><th>Status</th><th>Data</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {oportunidades.map((o) => {
                  const plano = `/app/clientes/${c.id}/oportunidades/${o.id}`;
                  const concluidas = o.acoes.filter((a) => a.status === "concluido").length;
                  return (
                    <tr key={o.id}>
                      <td><span className={`etiqueta etiqueta-${o.tipo}`}>{ROTULO_TIPO_OPORTUNIDADE[o.tipo]}</span></td>
                      <td>
                        <Link href={plano}>{o.titulo}</Link>
                        {o.representada && <div className="dica">{o.representada.nome}</div>}
                      </td>
                      <td>{ROTULO_PRIORIDADE[o.prioridade] ?? o.prioridade}</td>
                      <td>
                        <form action={atualizarOportunidadeAction.bind(null, c.id, o.id, "lista")} className="inline">
                          <Selecao label="" name="status" opcoes={OPCOES_STATUS} valor={o.status} />
                          <button className="btn-link" type="submit" title="Salvar status">OK</button>
                        </form>
                      </td>
                      <td>{formatarData(o.criado_em)}</td>
                      <td className="acoes-linha">
                        <Link href={plano}>Plano ({concluidas}/{o.acoes.length})</Link>
                        <form action={excluirOportunidadeAction.bind(null, c.id, o.id)}>
                          <button className="btn-link perigo" type="submit">Excluir</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
