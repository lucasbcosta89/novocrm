import Link from "next/link";
import { Mensagens } from "@/components/form";
import { Icone } from "@/components/icones";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { ROTULO_RESULTADO } from "@/lib/rotulos";
import { carregar } from "@/server/acao";
import { listarFunis } from "@/server/funis";
import { listarKanban } from "@/server/oportunidades";
import { desarquivarAction } from "../actions";
import { FiltroFunil } from "../filtro-funil";

/** Subpágina "Arquivo": oportunidades arquivadas, com filtro por funil e "Desarquivar" (volta à mesma etapa). */
export default async function ArquivoPage({ searchParams }: { searchParams: Promise<{ funil?: string; erro?: string; ok?: string }> }) {
  const { funil, erro, ok } = await searchParams;
  const [todos, funis] = await carregar((ctx) => Promise.all([listarKanban(ctx, true), listarFunis(ctx)]));
  const filtro = funis.some((f) => f.id === funil) ? funil! : "";
  const itens = filtro ? todos.filter((o) => o.funil_id === filtro) : todos;
  const nomeFunil = new Map(funis.map((f) => [f.id, f.nome] as const));
  const nomeEtapa = new Map(funis.flatMap((f) => f.etapas.map((e) => [e.id, e.nome] as const)));
  const voltar = filtro ? `/app/oportunidades/arquivo?funil=${filtro}` : "/app/oportunidades/arquivo";

  return (
    <>
      <Mensagens erro={erro} ok={ok} />
      <section className="card">
        <div className="cabecalho">
          <h2 className="titulo-icone"><Icone nome="arquivo" tamanho={20} /> Oportunidades arquivadas</h2>
          <FiltroFunil funis={funis.map((f) => ({ id: f.id, nome: f.nome }))} atual={filtro} />
        </div>
        {itens.length === 0 ? (
          <div className="vazio">{filtro ? "Nenhuma oportunidade arquivada neste funil." : "Nenhuma oportunidade arquivada."}</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Oportunidade</th><th>Cliente</th><th>Funil / etapa</th><th>Resultado</th>
                  <th className="num">Valor estimado</th><th>Concluída em</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((o) => (
                  <tr key={o.id}>
                    <td>{o.titulo}<div className="item-sub">{o.representada?.nome ?? "Sem representada"}</div></td>
                    <td>{o.cliente ? <Link href={`/app/clientes/${o.cliente.id}`}>{o.cliente.nome}</Link> : "—"}</td>
                    <td>
                      {(o.funil_id && nomeFunil.get(o.funil_id)) ?? "—"}
                      {o.etapa_id && nomeEtapa.get(o.etapa_id) && <div className="item-sub">{nomeEtapa.get(o.etapa_id)}</div>}
                    </td>
                    <td>
                      {o.resultado ? (
                        <span className={`etiqueta ${o.resultado === "ganhou" ? "etiqueta-recebida" : "etiqueta-atrasada"}`}>{ROTULO_RESULTADO[o.resultado]}</span>
                      ) : "—"}
                    </td>
                    <td className="num">{o.valor_estimado != null ? formatarMoeda(Number(o.valor_estimado)) : "—"}</td>
                    <td>{o.data_conclusao ? formatarData(o.data_conclusao) : "—"}</td>
                    <td>
                      <form action={desarquivarAction.bind(null, o.id, voltar)}>
                        <button className="btn-suave btn-peq" type="submit"><Icone nome="historico" tamanho={16} /> Desarquivar</button>
                      </form>
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
