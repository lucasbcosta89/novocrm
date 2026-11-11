import Link from "next/link";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { Mensagens } from "@/components/form";
import { Icone } from "@/components/icones";
import { AvisoLimite } from "@/components/limite";
import { StatusRepresentada } from "@/components/status";
import { POR_PAGINA, urlListagem, type FiltroRepresentadas, type Ordenacao } from "@/lib/cadastros/listagem-representadas";
import { formatarDocumento, formatarMoeda, formatarPercentual } from "@/lib/formato";
import { UFS } from "@/lib/ufs";
import { carregar } from "@/server/acao";
import { podeImportar } from "@/server/importacao";
import { obterUso } from "@/server/quota";
import { listarRepresentadasListagem } from "@/server/representadas";
import { alterarStatusRepresentadaAction, excluirRepresentadaAction } from "./actions";

type Busca = Promise<Record<string, string | string[] | undefined>>;

/** Cabeçalho ordenável: clicar alterna asc/desc na mesma coluna; outra coluna começa em asc. */
function Th({ f, col, children, num }: { f: FiltroRepresentadas; col: Ordenacao; children: React.ReactNode; num?: boolean }) {
  const ativa = f.ordem === col;
  const dir = ativa && f.dir === "asc" ? "desc" : "asc";
  return (
    <th className={num ? "num" : undefined} aria-sort={ativa ? (f.dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link className="th-ordenavel" href={urlListagem(f, { ordem: col, dir, pagina: 1 })}>
        {children}
        <span aria-hidden="true" className={ativa ? "seta-ordem ativa" : "seta-ordem"}>{ativa && f.dir === "desc" ? "▼" : "▲"}</span>
      </Link>
    </th>
  );
}

/** Representadas: busca normalizada, filtros, ordenação em todas as colunas, paginação, CSV e ações por linha. */
export default async function RepresentadasPage({ searchParams }: { searchParams: Busca }) {
  const sp = await searchParams;
  const [{ linhas, total, filtro: f }, uso, importar] = await carregar((ctx) =>
    Promise.all([listarRepresentadasListagem(ctx, sp), obterUso(ctx), podeImportar(ctx)]),
  );
  const erro = typeof sp.erro === "string" ? sp.erro : undefined;
  const ok = typeof sp.ok === "string" ? sp.ok : undefined;
  const bloqueado = uso.recursos.representadas.atingido;
  const filtrando = !!(f.q || f.status || f.uf);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const aqui = urlListagem(f);
  // exportação = mesma visão filtrada/ordenada da tela, em CSV ou XLSX
  const exportar = urlListagem({ ...f, pagina: 1 }, {}, "/api/representadas/exportar");
  const exportarComo = (formato: "csv" | "xlsx") => `${exportar}${exportar.includes("?") ? "&" : "?"}formato=${formato}`;

  const acoes = (
    <div className="acoes-linha">
      {bloqueado
        ? <button className="btn" type="button" disabled><Icone nome="mais" tamanho={16} /> Nova representada</button>
        : <Link className="btn" href="/app/representadas/nova"><Icone nome="mais" tamanho={16} /> Nova representada</Link>}
      {importar && <Link className="btn-secundario" href="/app/representadas/importar"><Icone nome="arquivo" tamanho={16} /> Importar planilha</Link>}
    </div>
  );

  return (
    <>
      <div className="cabecalho-pagina">
        <h1 className="titulo-icone"><Icone nome="predio" tamanho={24} /> Representadas</h1>
        {acoes}
      </div>
      <Mensagens erro={erro} ok={ok} />
      <AvisoLimite uso={uso} recurso="representadas" />
      {bloqueado && <p className="dica">Para liberar uma vaga, use “Remover permanentemente” (ícone de lixeira) em uma representada que você não atende mais.</p>}

      <section className="card">
        {total === 0 && !filtrando ? (
          <div className="vazio vazio-acoes">
            <p>Nenhuma representada cadastrada ainda.</p>
            {acoes}
          </div>
        ) : (
          <>
            <form method="get" className="filtros-custos">
              <label className="campo">
                <span>Buscar</span>
                <input type="search" name="q" defaultValue={f.q} maxLength={60} placeholder="Razão social, nome fantasia ou CNPJ" />
              </label>
              <label className="campo">
                <span>Status</span>
                <select name="status" defaultValue={f.status ?? ""}>
                  <option value="">Todos</option>
                  <option value="ativa">Ativa</option>
                  <option value="inativa">Inativa</option>
                </select>
              </label>
              <label className="campo">
                <span>UF</span>
                <select name="uf" defaultValue={f.uf ?? ""}>
                  <option value="">Todas</option>
                  {UFS.map(([sigla]) => <option key={sigla} value={sigla}>{sigla}</option>)}
                </select>
              </label>
              {f.ordem !== "razao_social" && <input type="hidden" name="ordem" value={f.ordem} />}
              {f.dir !== "asc" && <input type="hidden" name="dir" value={f.dir} />}
              <div className="acoes-linha">
                <button className="btn-secundario btn-peq" type="submit"><Icone nome="filtro" tamanho={16} /> Filtrar</button>
                {filtrando && <Link className="btn-link" href="/app/representadas">Limpar</Link>}
                <a className="btn-suave btn-peq" href={exportarComo("xlsx")} download><Icone nome="download" tamanho={16} /> Exportar XLSX</a>
                <a className="btn-suave btn-peq" href={exportarComo("csv")} download><Icone nome="download" tamanho={16} /> Exportar CSV</a>
              </div>
            </form>

            {total === 0 ? (
              <p className="vazio">Nenhuma representada com esses filtros.</p>
            ) : (
              <div className="tabela-wrap">
                <table className="tabela tabela-pedidos">
                  <thead>
                    <tr>
                      <Th f={f} col="codigo">Código</Th>
                      <Th f={f} col="razao_social">Razão social</Th>
                      <Th f={f} col="cnpj">CNPJ</Th>
                      <Th f={f} col="cidade_uf">Cidade/UF</Th>
                      <Th f={f} col="comissao" num>Comissão fixa</Th>
                      <Th f={f} col="status">Status</Th>
                      <Th f={f} col="clientes" num>Clientes</Th>
                      <Th f={f} col="vendido_90d" num>Vendido 90 dias</Th>
                      <th className="col-acoes">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((r) => (
                      <tr key={r.id}>
                        <td data-rotulo="Código"><code>{r.codigo_representada}</code></td>
                        <td data-rotulo="Razão social">
                          <Link href={`/app/representadas/${r.id}`}>{r.razao_social}</Link>
                          {r.nome_fantasia && <div className="dica">{r.nome_fantasia}</div>}
                        </td>
                        <td data-rotulo="CNPJ">{formatarDocumento(r.cnpj)}</td>
                        <td data-rotulo="Cidade/UF">{[r.cidade, r.uf].filter(Boolean).join("/") || "—"}</td>
                        <td className="num" data-rotulo="Comissão fixa">{r.comissao_percentual == null ? <span className="dica">por produto</span> : formatarPercentual(r.comissao_percentual)}</td>
                        <td data-rotulo="Status"><StatusRepresentada status={r.status} /></td>
                        <td className="num" data-rotulo="Clientes">{r.clientes_vinculados}</td>
                        <td className="num" data-rotulo="Vendido 90 dias">{formatarMoeda(r.valor_vendido_90d)}</td>
                        <td className="col-acoes" data-rotulo="Ações">
                          <span className="acoes-icones">
                            <span className="com-dica" data-dica="Editar">
                              <Link className="botao-icone botao-acao" href={`/app/representadas/${r.id}/editar`} aria-label={`Editar ${r.razao_social}`}>
                                <Icone nome="lapis" tamanho={17} />
                              </Link>
                            </span>
                            <span className="com-dica" data-dica="Ver clientes vinculados">
                              <Link className="botao-icone botao-acao" href={`/app/representadas/${r.id}/clientes`} aria-label={`Clientes vinculados a ${r.razao_social}`}>
                                <Icone nome="pessoas" tamanho={17} />
                              </Link>
                            </span>
                            <form action={alterarStatusRepresentadaAction.bind(null, r.id, r.status === "ativa" ? "inativa" : "ativa", aqui)}>
                              {r.status === "ativa" ? (
                                <BotaoConfirmar
                                  className="botao-icone botao-acao botao-excluir"
                                  icone={<Icone nome="cancelado" tamanho={17} />}
                                  rotulo="Inativar"
                                  pergunta={`Inativar "${r.razao_social}"? Ela deixa de aparecer em novos pedidos; histórico e clientes vinculados continuam visíveis.`}
                                />
                              ) : (
                                <span className="com-dica" data-dica="Reativar">
                                  <button className="botao-icone botao-acao" type="submit" aria-label={`Reativar ${r.razao_social}`}><Icone nome="concluido" tamanho={17} /></button>
                                </span>
                              )}
                            </form>
                            <form action={excluirRepresentadaAction.bind(null, r.id)}>
                              <BotaoConfirmar
                                className="botao-icone botao-acao botao-excluir"
                                icone={<Icone nome="lixeira" tamanho={17} />}
                                rotulo="Remover permanentemente"
                                pergunta={`Remover "${r.razao_social}" permanentemente? Ela sai da conta e libera a vaga do plano; pedidos e comissões já lançados continuam no histórico. Esta ação não pode ser desfeita.`}
                              />
                            </form>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {total > 0 && (
              <div className="paginacao">
                <span className="dica">{total} representada(s)</span>
                {f.pagina > 1
                  ? <Link className="btn-suave btn-peq" href={urlListagem(f, { pagina: f.pagina - 1 })}>Anterior</Link>
                  : <button className="btn-suave btn-peq" type="button" disabled>Anterior</button>}
                <span className="dica">Página {Math.min(f.pagina, paginas)} de {paginas}</span>
                {f.pagina < paginas
                  ? <Link className="btn-suave btn-peq" href={urlListagem(f, { pagina: f.pagina + 1 })}>Próxima</Link>
                  : <button className="btn-suave btn-peq" type="button" disabled>Próxima</button>}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
