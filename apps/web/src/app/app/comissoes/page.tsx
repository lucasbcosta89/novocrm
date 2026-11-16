import Link from "next/link";
import { AvisoPendentesAnalise } from "@/components/aviso-comissoes";
import { Mensagens } from "@/components/form";
import { Icone } from "@/components/icones";
import { assinaturaFiltro, contarFiltrosAtivos, lerFiltroComissoes, urlComissoes, type FiltroComissoes as Filtro } from "@/lib/comissoes/filtro";
import { GRUPOS_STATUS, ROTULOS_GRUPO, rotuloMotivo, rotuloTotal, type GrupoStatus } from "@/lib/comissoes/status";
import { formatarMoeda } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { listarClientes } from "@/server/clientes";
import {
  descreverEvento, historicoDasComissoes, listarComissoes, listarLotes, nomesDosAutores, pendentesDeAnalise, produtoDaComissao,
} from "@/server/comissoes";
import { listarRepresentadas } from "@/server/representadas";
import { BotaoReabrirLote, FiltroComissoes, TabelaComissoes, type LinhaComissao } from "./componentes";

type Busca = Promise<Record<string, string | string[] | undefined>>;
const TOM: Record<GrupoStatus, string> = { recebido: "tom-ok", a_receber: "tom-azul", em_analise: "tom-analise" };
const ICONE: Record<GrupoStatus, "concluido" | "relogio" | "alerta"> = { recebido: "concluido", a_receber: "relogio", em_analise: "alerta" };

export default async function ComissoesPage({ searchParams }: { searchParams: Busca }) {
  const sp = await searchParams;
  const erro = typeof sp.erro === "string" ? sp.erro : undefined;
  const ok = typeof sp.ok === "string" ? sp.ok : undefined;
  const f = lerFiltroComissoes(sp);
  const [res, pend, representadas, clientes, lotes, nomes] = await carregar((ctx) => Promise.all([
    listarComissoes(ctx, sp), pendentesDeAnalise(ctx), listarRepresentadas(ctx), listarClientes(ctx),
    f.visao === "lotes" ? listarLotes(ctx) : Promise.resolve([]), nomesDosAutores(ctx),
  ]));
  const historico = await carregar((ctx) => historicoDasComissoes(ctx, res.linhas.map((c) => c.id)));
  const url = (mudar: Partial<Record<keyof Filtro, unknown>> = {}) => urlComissoes(f, mudar);
  const ordem = (campo: "pedido" | "valor" | "previsao") => ({
    href: url({ ord: campo, dir: f.ord === campo && f.dir === "asc" ? "desc" : "asc", pag: 1 }),
    seta: f.ord === campo ? (f.dir === "asc" ? " ▲" : " ▼") : "",
  });
  const linhas: LinhaComissao[] = res.linhas.map((c) => ({
    id: c.id, pedido: c.pedido ? { id: c.pedido.id, codigo: c.pedido.codigo_pedido } : null, cliente: c.pedido?.cliente?.nome ?? "—",
    representada: c.representada, produto: produtoDaComissao(c), base: Number(c.pedido?.valor_total ?? 0), percentual: Number(c.percentual), valor: Number(c.valor),
    previsao: c.data_prevista_recebimento, recebimento: c.data_recebimento, status: c.status, completude: c.completude, motivos: c.motivos_pendencia,
    origem: c.origem_calculo, editada: c.data_recebimento_editada, lote: c.lote_aprovacao_id,
    historico: (historico.get(c.id) ?? []).map((e) => descreverEvento(e, nomes)),
  }));
  const gruposSomados: GrupoStatus[] = f.visao === "analise" ? ["em_analise"] : f.g.length ? f.g : [...GRUPOS_STATUS];
  const totalGeral = gruposSomados.reduce((t, g) => t + res.totais[g].valor, 0);
  const exportar = (formato: string) => { const u = urlComissoes({ ...f, pag: 1 }, {}, "/api/comissoes/exportar"); return `${u}${u.includes("?") ? "&" : "?"}formato=${formato}`; };
  const aba = (v: Filtro["visao"], rotulo: string) => (
    <Link className={`aba${f.visao === v ? " ativa" : ""}`} aria-current={f.visao === v ? "page" : undefined} href={urlComissoes({ ...f, pag: 1, visao: v })}>{rotulo}</Link>
  );

  return (
    <>
      <h1 className="titulo-icone"><Icone nome="cifrao" tamanho={24} /> Comissões</h1>
      <Mensagens erro={erro} ok={ok} />
      <AvisoPendentesAnalise quantidade={pend.quantidade} valor={pend.valor} />

      <nav className="abas" aria-label="Visões de comissões">
        {aba("lista", "Lançamentos")}
        {aba("analise", `Fila de análise${pend.quantidade ? ` (${pend.quantidade})` : ""}`)}
        {aba("lotes", "Aprovadas em lote")}
      </nav>

      {f.visao === "lotes" ? (
        <section className="card">
          <h2 className="titulo-icone"><Icone nome="check" tamanho={20} /> Aprovações em lote</h2>
          {lotes.length === 0 ? <div className="vazio">Nenhuma aprovação em lote.</div> : (
            <div className="tabela-wrap">
              <table className="tabela">
                <thead><tr><th>Data</th><th>Autor</th><th className="num">Quantidade</th><th className="num">Valor total</th><th>Motivos presentes</th><th>Situação</th><th /></tr></thead>
                <tbody>
                  {lotes.map((l) => (
                    <tr key={l.id}>
                      <td data-rotulo="Data">{new Date(l.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                      <td data-rotulo="Autor">{l.autor ? nomes.get(l.autor) ?? "usuário" : "—"}</td>
                      <td className="num" data-rotulo="Quantidade">{l.quantidade}</td>
                      <td className="num" data-rotulo="Valor total">{formatarMoeda(l.valor_total)}</td>
                      <td data-rotulo="Motivos">{Object.entries(l.motivos).map(([m, n]) => `${rotuloMotivo(m)}: ${n}`).join(" · ") || "—"}</td>
                      <td data-rotulo="Situação">{l.aprovadas_agora > 0 ? `${l.aprovadas_agora} ainda aprovada(s)` : l.reaberto_em ? "Reaberto" : "—"}</td>
                      <td>
                        <Link className="btn-link" href={urlComissoes({ ...f, visao: "lista", lote: true, pag: 1 })}>Ver</Link>{" "}
                        <BotaoReabrirLote lote={l.id} quantidade={l.aprovadas_agora} valor={l.valor_total} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <>
          <FiltroComissoes visao={f.visao} ativos={contarFiltrosAtivos(f)}
            filtro={{ p: f.p, de: res.periodo.de, ate: res.periodo.ate, campo: f.campo, g: f.g, comp: f.comp ?? "", mot: f.mot ?? "", rep: f.rep, cli: f.cli, lote: f.lote, ed: f.ed }}
            representadas={representadas.map((r) => ({ id: r.id, nome: r.nome }))} clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))} />

          <section className="card">
            <p className="subtitulo">{f.campo === "sem_previsao" ? "Sem previsão de recebimento" : res.periodo.rotulo}</p>
            <dl className="kpis">
              {GRUPOS_STATUS.filter((g) => f.visao !== "analise" || g === "em_analise").map((g) => (
                <div className="kpi" key={g}>
                  <span className={`kpi-icone ${TOM[g]}`}><Icone nome={ICONE[g]} tamanho={20} /></span>
                  <div>
                    <dt>{ROTULOS_GRUPO[g]}</dt>
                    <dd className={g === "recebido" ? "txt-ok" : undefined}>{formatarMoeda(res.totais[g].valor)}</dd>
                    <span className="item-sub">{res.totais[g].quantidade} lançamento(s)</span>
                  </div>
                </div>
              ))}
            </dl>
            <p className="dica"><strong>{rotuloTotal(gruposSomados)}:</strong> {formatarMoeda(totalGeral)} · {res.total} lançamento(s) no filtro (canceladas fora dos totais)</p>
            {res.emAnaliseFora > 0 && (
              <p className="chip-filtro chip-analise">{res.emAnaliseFora} comissões em análise não incluídas nos totais.</p>
            )}
          </section>

          <section className="card">
            <div className="cabecalho">
              <h2 className="titulo-icone"><Icone nome="recibo" tamanho={20} /> {f.visao === "analise" ? "Fila de análise" : "Lançamentos"}</h2>
              {res.total > 0 && (
                <div className="acoes-linha">
                  <a className="btn-suave btn-peq" href={exportar("xlsx")} download><Icone nome="download" tamanho={16} /> Exportar XLSX</a>
                  <a className="btn-suave btn-peq" href={exportar("csv")} download><Icone nome="download" tamanho={16} /> Exportar CSV</a>
                </div>
              )}
            </div>
            {f.visao === "analise" && <p className="dica">Comissões incompletas: nunca são liquidadas automaticamente. Corrija a origem do problema (a comissão sai da fila sozinha) ou analise e marque como recebida.</p>}
            {res.total === 0 ? (
              <div className="vazio">
                Nenhuma comissão {contarFiltrosAtivos(f) ? "com esses filtros" : "neste período"}.{" "}
                <Link href={f.visao === "lista" ? "/app/comissoes" : `/app/comissoes?visao=${f.visao}`}>Limpar filtros</Link>
              </div>
            ) : (
              <>
                <TabelaComissoes linhas={linhas} selecionaveis={res.selecionaveis} assinatura={assinaturaFiltro(f)} total={res.total}
                  filtro={{ ...f, pag: undefined }} analise={f.visao === "analise"}
                  ordens={{ pedido: ordem("pedido"), valor: ordem("valor"), previsao: ordem("previsao") }} />
                {res.paginas > 1 && (
                  <nav className="paginacao" aria-label="Páginas">
                    {res.pagina > 1 && <Link href={url({ pag: res.pagina - 1 })}>← Anterior</Link>}
                    <span>Página {res.pagina} de {res.paginas}</span>
                    {res.pagina < res.paginas && <Link href={url({ pag: res.pagina + 1 })}>Próxima →</Link>}
                  </nav>
                )}
                {res.limitado && <p className="dica">Mostrando os primeiros 10.000 lançamentos do filtro: refine o período.</p>}
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
