import Link from "next/link";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { Mensagens } from "@/components/form";
import { Icone } from "@/components/icones";
import { StatusDevolucao } from "@/components/status";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { ROTULO_MOTIVO_DEVOLUCAO, ROTULO_STATUS_DEVOLUCAO } from "@/lib/rotulos";
import { STATUS_DEVOLUCAO } from "@/lib/validacao";
import { carregar } from "@/server/acao";
import { listarDevolucoes } from "@/server/devolucoes";
import { excluirDevolucaoAction } from "./actions";

const dataValida = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const qtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Devoluções do cliente: filtros (período e status), tabela e ações editar/excluir. */
export default async function ClienteDevolucoes({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ de?: string; ate?: string; status?: string; erro?: string; ok?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const filtro = { de: dataValida(sp.de), ate: dataValida(sp.ate), status: (STATUS_DEVOLUCAO as readonly string[]).includes(sp.status ?? "") ? sp.status! : null };
  const devolucoes = await carregar((ctx) => listarDevolucoes(ctx, id, filtro));
  const filtrando = !!(filtro.de || filtro.ate || filtro.status);
  const base = `/app/clientes/${id}/devolucoes`;
  const total = devolucoes.reduce((t, d) => t + Number(d.valor_total), 0);

  return (
    <>
      <Mensagens erro={sp.erro} ok={sp.ok} />
      <section className="card">
        <div className="cabecalho">
          <h2 className="titulo-icone"><Icone nome="historico" tamanho={20} /> Devoluções</h2>
          <Link className="btn btn-peq" href={`${base}/nova`}><Icone nome="mais" tamanho={16} /> Registrar Devolução</Link>
        </div>

        <form method="get" className="filtros-custos">
          <label className="campo"><span>De</span><input type="date" name="de" defaultValue={filtro.de ?? ""} /></label>
          <label className="campo"><span>Até</span><input type="date" name="ate" defaultValue={filtro.ate ?? ""} /></label>
          <label className="campo">
            <span>Status</span>
            <select name="status" defaultValue={filtro.status ?? ""}>
              <option value="">Todos</option>
              {STATUS_DEVOLUCAO.map((s) => <option key={s} value={s}>{ROTULO_STATUS_DEVOLUCAO[s]}</option>)}
            </select>
          </label>
          <div className="acoes-linha">
            <button className="btn-secundario btn-peq" type="submit"><Icone nome="filtro" tamanho={16} /> Filtrar</button>
            {filtrando && <Link className="btn-link" href={base}>Limpar</Link>}
          </div>
        </form>

        {devolucoes.length === 0 ? (
          <p className="vazio">{filtrando ? "Nenhuma devolução com esses filtros." : "Nenhuma devolução registrada para este cliente."}</p>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nº</th><th>Data</th><th>Pedido de origem</th><th className="num">Itens (qtd)</th><th className="num">Valor</th>
                  <th>Motivo</th><th>Status</th><th className="col-acoes">Ações</th>
                </tr>
              </thead>
              <tbody>
                {devolucoes.map((d) => (
                  <tr key={d.id}>
                    <td data-rotulo="Nº">{d.numero}</td>
                    <td data-rotulo="Data">{formatarData(`${d.data}T12:00:00Z`)}</td>
                    <td data-rotulo="Pedido de origem">{d.pedido ? <Link href={`/app/pedidos/${d.pedido.id}`}>{d.pedido.codigo_pedido}</Link> : <span className="dica">Avulsa</span>}</td>
                    <td className="num" data-rotulo="Itens (qtd)">{d.itens.length} ({qtd(d.itens.reduce((t, i) => t + Number(i.quantidade), 0))})</td>
                    <td className="num" data-rotulo="Valor">{formatarMoeda(Number(d.valor_total))}</td>
                    <td data-rotulo="Motivo">{ROTULO_MOTIVO_DEVOLUCAO[d.motivo] ?? d.motivo}</td>
                    <td data-rotulo="Status"><StatusDevolucao status={d.status} /></td>
                    <td className="col-acoes" data-rotulo="Ações">
                      <span className="acoes-icones">
                        <span className="com-dica" data-dica="Editar devolução">
                          <Link className="botao-icone botao-acao" href={`${base}/${d.id}/editar`} aria-label={`Editar devolução ${d.numero}`}>
                            <Icone nome="lapis" tamanho={17} />
                          </Link>
                        </span>
                        <form action={excluirDevolucaoAction.bind(null, id, d.id)}>
                          <BotaoConfirmar className="botao-icone botao-acao botao-excluir" icone={<Icone nome="lixeira" tamanho={17} />} rotulo="Excluir devolução"
                            pergunta={`Excluir a devolução ${d.numero} (${formatarMoeda(Number(d.valor_total))})? Esta ação não pode ser desfeita.`} />
                        </form>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th colSpan={4}>Total · {devolucoes.length} {devolucoes.length === 1 ? "devolução" : "devoluções"}</th><th className="num">{formatarMoeda(total)}</th><th colSpan={3} /></tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
