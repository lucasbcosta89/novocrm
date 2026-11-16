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
import { listarDevolucoesImportadas } from "@/server/estornos";

type Busca = Promise<Record<string, string | string[] | undefined>>;
const TOM: Record<GrupoStatus, string> = { recebido: "tom-ok", a_receber: "tom-azul", em_analise: "tom-analise" };
const ICONE: Record<GrupoStatus, "concluido" | "relogio" | "alerta"> = { recebido: "concluido", a_receber: "relogio", em_analise: "alerta" };

export default async function ComissoesPage({ searchParams }: { searchParams: Busca }) {
  const sp = await searchParams;
  const erro = typeof sp.erro === "string" ? sp.erro : undefined;
  const ok = typeof sp.ok === "string" ? sp.ok : undefined;
  const f = lerFiltroComissoes(sp);
  const [res, pend, representadas, clientes, lotes, nomes, devs] = await carregar((ctx) => Promise.all([
    listarComissoes(ctx, sp), pendentesDeAnalise(ctx), listarRepresentadas(ctx), listarClientes(ctx),
    f.visao === "lotes" ? listarLotes(ctx) : Promise.resolve([]), nomesDosAutores(ctx),
    f.visao === "devolucoes" ? listarDevolucoesImportadas(ctx, sp) : Promise.resolve(null),
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
    tipo: c.tipo, observacao: c.observacoes,
    devolucao: c.devolucao ? { ...c.devolucao, importada: !!c.devolucao.chave_unica, cliente_id: null } : null,
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
        {aba("devolucoes", "Devoluções")}
      </nav>

      {f.visao === "devolucoes" && devs ? (
        <>
          <form method="get" className="card filtros-custos">
            <input type="hidden" name="visao" value="devolucoes" />
            <label className="campo"><span>Período</span>
              <select name="p" defaultValue={typeof sp.p === "string" ? sp.p : "este_mes"}>
                {["7d", "30d", "90d", "este_mes", "ano", "ano_anterior"].map((a) => <option key={a} value={a}>{({ "7d": "Últimos 7 dias", "30d": "Últimos 30 dias", "90d": "Últimos 90 dias", este_mes: "Este mês", ano: "Este ano", ano_anterior: "Ano anterior" } as Record<string, string>)[a]}</option>)}
              </select>
            </label>
            <label className="campo"><span>Data do período</span>
              <select name="campo" defaultValue={sp.campo === "devolucao" ? "devolucao" : "processamento"}>
                <option value="processamento">Data de Processamento (mês do estorno)</option>
                <option value="devolucao">Data da Devolução</option>
              </select>
            </label>
            <label className="campo"><span>Processamento</span>
              <select name="st" defaultValue={typeof sp.st === "string" ? sp.st : ""}>
                <option value="">Todas</option><option value="pendente">Sem Data de Processamento</option><option value="processada">Processadas</option>
              </select>
            </label>
            <label className="campo"><span>Origem</span>
              <select name="orig" defaultValue={typeof sp.orig === "string" ? sp.orig : ""}>
                <option value="">Todas</option><option value="manual">Cadastro manual</option><option value="excel">Importada por Excel</option>
              </select>
            </label>
            <label className="campo"><span>Representada</span>
              <select name="rep" defaultValue={typeof sp.rep === "string" ? sp.rep : ""}>
                <option value="">Todas</option>
                {representadas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
            </label>
            <div className="acoes-linha">
              <button className="btn-secundario btn-peq" type="submit"><Icone nome="filtro" tamanho={16} /> Aplicar</button>
              {devs.linhas.length > 0 && <a className="btn-suave btn-peq" download href={`/api/comissoes/devolucoes/exportar?${new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString()}`}><Icone nome="download" tamanho={16} /> Exportar XLSX</a>}
            </div>
          </form>
          <section className="card">
            <p className="subtitulo">{devs.periodo.rotulo}</p>
            <dl className="kpis">
              <div className="kpi"><div><dt>Devoluções</dt><dd>{devs.totais.quantidade}</dd><span className="item-sub">{devs.totais.pendentes} pendente(s) · {devs.totais.processadas} processada(s)</span></div></div>
              <div className="kpi"><div><dt>Valor devolvido</dt><dd>{formatarMoeda(devs.totais.valor_total)}</dd></div></div>
              <div className="kpi"><div><dt>Comissão estornada</dt><dd className="valor-estorno">−{formatarMoeda(devs.totais.comissao_estornada)}</dd></div></div>
            </dl>
            {devs.porRepresentada.length > 0 && (
              <div className="tabela-wrap">
                <table className="tabela">
                  <thead><tr><th>Representada</th><th className="num">Devoluções</th><th className="num">Valor devolvido</th><th className="num">Comissão estornada</th></tr></thead>
                  <tbody>{devs.porRepresentada.map((r) => <tr key={r.id}><td>{r.nome}</td><td className="num">{r.quantidade}</td><td className="num">{formatarMoeda(r.valor_total)}</td><td className="num">−{formatarMoeda(r.comissao_estornada)}</td></tr>)}</tbody>
                  <tfoot><tr><th>Total</th><th className="num">{devs.totais.quantidade}</th><th className="num">{formatarMoeda(devs.totais.valor_total)}</th><th className="num">−{formatarMoeda(devs.totais.comissao_estornada)}</th></tr></tfoot>
                </table>
              </div>
            )}
          </section>
          <section className="card">
            <h2 className="titulo-icone"><Icone nome="recibo" tamanho={20} /> Devoluções</h2>
            <p className="dica">Visão de análise. Para cadastrar, importar por Excel ou informar a Data de Processamento, use a página do cliente › Devoluções.</p>
            {devs.linhas.length === 0 ? <div className="vazio">Nenhuma devolução neste período.</div> : (
              <>
                <div className="tabela-wrap tabela-rolagem">
                  <table className="tabela tabela-compacta">
                    <thead><tr><th>Nº</th><th>Cliente</th><th>Pedido</th><th>Representada</th><th>SKU / itens</th><th className="num">Qtd.</th><th className="num">Valor</th><th className="num">Comissão estornada</th><th>Origem</th><th>Devolução</th><th>Processamento</th></tr></thead>
                    <tbody>
                      {devs.linhas.map((d) => (
                        <tr key={d.id}>
                          <td data-rotulo="Nº">{d.numero}</td>
                          <td data-rotulo="Cliente">{d.cliente ? <Link href={`/app/clientes/${d.cliente.id}/devolucoes`}>{d.cliente.nome}</Link> : "—"}</td>
                          <td data-rotulo="Pedido">{d.pedido ? <Link href={`/app/pedidos/${d.pedido.id}`}>{d.pedido.codigo_pedido}</Link> : d.codigo_pedido_informado ?? "—"}</td>
                          <td data-rotulo="Representada">{d.representada?.nome ?? "—"}</td>
                          <td data-rotulo="SKU / itens">{d.sku_informado ?? (d.itens_qtd ? `${d.itens_qtd} item(ns)` : "—")}{d.descricao_informada && <div className="dica">{d.descricao_informada}</div>}</td>
                          <td className="num" data-rotulo="Qtd.">{Number(d.quantidade ?? 0).toLocaleString("pt-BR")}</td>
                          <td className="num" data-rotulo="Valor">{formatarMoeda(d.valor_total)}</td>
                          <td className="num" data-rotulo="Comissão estornada"><span className="valor-estorno">−{formatarMoeda(d.comissao_estornada)}</span></td>
                          <td data-rotulo="Origem">{d.chave_unica ? "Excel" : "Manual"}</td>
                          <td data-rotulo="Devolução">{d.data.split("-").reverse().join("/")}</td>
                          <td data-rotulo="Processamento">{d.data_processamento ? d.data_processamento.split("-").reverse().join("/") : <span className="dica">pendente</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      ) : f.visao === "lotes" ? (
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
          {res.porRepresentada.length > 0 && (
            <div className="cards-resumo cards-representadas">
              {res.porRepresentada.map((r) => (
                <section key={r.id} className={`card ${r.atraso > 0 ? "card-alerta" : ""}`}>
                  <h3 className="titulo-icone"><Icone nome="predio" tamanho={18} /><Link href={urlComissoes({ ...f, rep: [r.id], pag: 1 })}>{r.nome}</Link></h3>
                  <dl className="kpis kpis-compactos">
                    <div className="kpi"><div><dt>Recebida</dt><dd className="txt-ok">{formatarMoeda(r.recebida)}</dd></div></div>
                    <div className="kpi"><div><dt>A receber</dt><dd>{formatarMoeda(r.a_receber)}</dd></div></div>
                    <div className="kpi"><div><dt>Em atraso</dt><dd className={r.atraso > 0 ? "atrasada" : undefined}>{formatarMoeda(r.atraso)}</dd></div></div>
                  </dl>
                </section>
              ))}
            </div>
          )}
          <FiltroComissoes visao={f.visao} ativos={contarFiltrosAtivos(f)}
            filtro={{ p: f.p, de: res.periodo.de, ate: res.periodo.ate, campo: f.campo, g: f.g, comp: f.comp ?? "", mot: f.mot ?? "", rep: f.rep, cli: f.cli, lote: f.lote, ed: f.ed, tipo: f.tipo ?? "" }}
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
              <div className="kpi">
                <span className={`kpi-icone ${res.atraso > 0 ? "tom-perigo" : "tom-neutro"}`}><Icone nome="alerta" tamanho={20} /></span>
                <div><dt>Comissões em Atraso (R$)</dt><dd className={res.atraso > 0 ? "atrasada" : undefined}>{formatarMoeda(res.atraso)}</dd><span className="item-sub">a receber com previsão vencida</span></div>
              </div>
              <div className="kpi">
                <span className="kpi-icone tom-neutro"><Icone nome="recibo" tamanho={20} /></span>
                <div><dt>Abatimento de Comissão por devoluções (R$)</dt><dd>{formatarMoeda(res.abatimento)}</dd><span className="item-sub">estornos processados</span></div>
              </div>
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
