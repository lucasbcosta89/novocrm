import { BotaoCatalogoPdf, BotaoCatalogoWeb } from "@/components/catalogo-acoes";
import { EnviarCatalogo } from "@/components/enviar-catalogo";
import Link from "next/link";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { Campo, Mensagens } from "@/components/form";
import { AvisoLimite } from "@/components/limite";
import { formatarMoeda, comissaoEfetiva, formatarPercentual } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { listarClientesDaRepresentada } from "@/server/consultas";
import { pendenciasDoCatalogo } from "@/server/pedidos";
import { listarProdutos } from "@/server/produtos";
import { obterUso } from "@/server/quota";
import { obterRepresentada } from "@/server/representadas";
import { atualizarProdutoAction, criarProdutoAction, excluirProdutoAction, imagemProdutoAction, vincularProdutoPendentesAction } from "../../actions";
import { Icone } from "@/components/icones";
import { ModalImportarProdutos } from "./_components/ModalImportarProdutos";

/** Catálogo: produtos + Gerar Catálogo (PDF) e Enviar por WhatsApp (Fase 7c). */
type Busca = Promise<{ erro?: string; ok?: string; sku?: string; nome?: string; preco?: string; voltar_pedido?: string }>;

export default async function RepresentadaCatalogo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { erro, ok } = sp;
  const [r, produtos, vinculados, uso, pendencias] = await carregar((ctx) =>
    Promise.all([
      obterRepresentada(ctx, id),
      listarProdutos(ctx, id),
      listarClientesDaRepresentada(ctx, id),
      obterUso(ctx),
      pendenciasDoCatalogo(ctx, id),
    ]),
  );
  // "Cadastrar produto" (pedido importado ou alerta abaixo): formulário pré-preenchido pela query string
  const pre = { sku: sp.sku?.slice(0, 60) ?? "", nome: sp.nome?.slice(0, 160) ?? "", preco: sp.preco && Number(sp.preco) >= 0 ? sp.preco : "" };
  const voltarPedido = sp.voltar_pedido && /^[0-9a-f-]{36}$/i.test(sp.voltar_pedido) ? sp.voltar_pedido : null;
  const aCadastrar = pendencias.filter((x) => !x.produto);
  const aVincular = pendencias.filter((x) => x.produto);
  const linkCadastrar = (x: { sku: string; descricao: string | null; preco: number }) =>
    `?${new URLSearchParams({ sku: x.sku, nome: x.descricao ?? "", preco: String(x.preco) })}#novo-produto`;

  return (
    <>
      <Mensagens erro={erro} ok={ok} />
      {/* Pendências de pedidos importados: aparece só enquanto houver alguma e some ao resolver a última */}
      {pendencias.length > 0 && (
        <section className="card">
          {aCadastrar.length > 0 && (
            <>
              <p className="aviso aviso-alerta importar-aviso">
                <span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>
                <span>{aCadastrar.reduce((t, x) => t + x.itens, 0)} item(ns) de pedidos importados têm produtos que não estão no Catálogo. Cadastre-os para vincular aos pedidos.</span>
              </p>
              <div className="tabela-wrap">
                <table className="tabela">
                  <thead><tr><th>SKU</th><th>Descrição da planilha</th><th className="num">Itens afetados</th><th>Ação</th></tr></thead>
                  <tbody>
                    {aCadastrar.map((x) => (
                      <tr key={x.sku}>
                        <td data-rotulo="SKU"><code>{x.sku}</code></td>
                        <td data-rotulo="Descrição da planilha">{x.descricao ?? "—"}</td>
                        <td className="num" data-rotulo="Itens afetados">{x.itens} em {x.pedidos} pedido(s)</td>
                        <td data-rotulo="Ação"><Link className="btn-suave btn-peq" href={linkCadastrar(x)}><Icone nome="mais" tamanho={14} /> Cadastrar produto</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {aVincular.length > 0 && (
            <>
              <p className="aviso aviso-alerta importar-aviso">
                <span className="circulo-icone"><Icone nome="link" tamanho={16} /></span>
                <span>{aVincular.reduce((t, x) => t + x.itens, 0)} item(ns) de pedidos aguardam vínculo: o SKU já está no Catálogo, mas foi cadastrado sem ligar os itens pendentes.</span>
              </p>
              <p className="dica">Este caso é separado do anterior porque o produto já existe: basta ligar os itens pendentes a ele, sem cadastrar nada de novo.</p>
              <div className="tabela-wrap">
                <table className="tabela">
                  <thead><tr><th>SKU</th><th>Produto encontrado</th><th className="num">Itens afetados</th><th>Ação</th></tr></thead>
                  <tbody>
                    {aVincular.map((x) => (
                      <tr key={x.sku}>
                        <td data-rotulo="SKU"><code>{x.sku}</code></td>
                        <td data-rotulo="Produto encontrado">{x.produto!.nome}</td>
                        <td className="num" data-rotulo="Itens afetados">{x.itens} em {x.pedidos} pedido(s)</td>
                        <td data-rotulo="Ação">
                          <form action={vincularProdutoPendentesAction.bind(null, r.id, x.sku)}>
                            <BotaoConfirmar
                              className="btn-suave btn-peq"
                              texto="Vincular produto"
                              pergunta={`Vincular ${x.itens} item(ns) pendente(s) do SKU ${x.sku} ao produto "${x.produto!.nome}" do Catálogo? O preço dos itens nos pedidos não muda.`}
                            />
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
      <section className="card">
        <AvisoLimite uso={uso} recurso="pdf_mes" />
        <div className="barra-acoes">
          <BotaoCatalogoPdf representadaId={r.id} desabilitado={uso.recursos.pdf_mes.atingido} />
          <BotaoCatalogoWeb slug={r.slug} publico={r.catalogo_publico} />
          {vinculados.length > 0 ? (
            <EnviarCatalogo representadaId={r.id} clientes={vinculados} icone />
          ) : (
            <small className="dica">Vincule clientes para enviar o catálogo por WhatsApp.</small>
          )}
        </div>
      </section>

      <section className="card" id="produtos">
        <div className="cabecalho">
          <h2 className="titulo-icone"><Icone nome="pacote" tamanho={20} /> Produtos</h2>
          <ModalImportarProdutos representadaId={r.id} />
        </div>
        {produtos.length === 0 ? (
          <div className="vazio">Nenhum produto.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th></th><th>SKU</th><th>Nome</th><th>Categoria</th><th>NCM</th><th>Un.</th><th>Preço padrão</th><th>Desc. máx.</th><th>Comissão</th><th>Ativo</th><th></th></tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.imagem_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="miniatura" src={`/api/produtos/${p.id}/imagem?v=${encodeURIComponent(p.imagem_url)}`} alt="" />
                      ) : (
                        <span className="miniatura vazia" />
                      )}
                    </td>
                    <td><code>{p.sku}</code></td>
                    <td>{p.nome}</td>
                    <td>{p.categoria ?? "—"}</td>
                    <td>{p.ncm ?? "—"}</td>
                    <td>{p.unidade ?? "—"}</td>
                    <td>{formatarMoeda(p.preco)}</td>
                    <td>{formatarPercentual(p.desconto_max)}</td>
                    <td>{(() => { const c = comissaoEfetiva(p.comissao, r.comissao_percentual); return <>{formatarPercentual(c.valor)}{c.origem !== "produto" && <div className="dica">{c.origem === "representada" ? "fixa da representada" : "sem comissão"}</div>}</>; })()}</td>
                    <td>{p.ativo ? "Sim" : "Não"}</td>
                    <td>
                      <details>
                        <summary>Editar</summary>
                        <form action={atualizarProdutoAction.bind(null, r.id, p.id)} className="grade">
                          <Campo label="SKU *" name="sku" required defaultValue={p.sku} />
                          <Campo label="Nome *" name="nome" required defaultValue={p.nome} />
                          <Campo label="Unidade" name="unidade" defaultValue={p.unidade ?? ""} />
                          <Campo label="Categoria" name="categoria" defaultValue={p.categoria ?? ""} />
                          <Campo label="NCM" name="ncm" inputMode="numeric" maxLength={10} placeholder="8 dígitos" defaultValue={p.ncm ?? ""} />
                          <Campo label="Preço *" name="preco" type="number" step="0.01" min="0" required defaultValue={p.preco} />
                          <Campo label="Desc. máx. (%)" name="desconto_max" type="number" step="0.01" min="0" max="100" defaultValue={p.desconto_max} />
                          <Campo label="Comissão (%)" name="comissao" type="number" step="0.01" min="0" max="100" defaultValue={p.comissao ?? ""} placeholder={r.comissao_percentual != null ? `Vazio = fixa ${formatarPercentual(Number(r.comissao_percentual))}` : "Vazio = sem comissão"} />
                          <Campo label="Descrição" name="descricao" defaultValue={p.descricao ?? ""} />
                          <label className="check"><input type="checkbox" name="ativo" defaultChecked={p.ativo} /> Ativo</label>
                          <div className="acoes"><button className="btn" type="submit">Salvar</button></div>
                        </form>
                        <form action={imagemProdutoAction.bind(null, r.id, p.id)} className="inline">
                          <label className="campo">
                            <span>Imagem (JPEG/PNG até 2 MB)</span>
                            <input type="file" name="imagem" accept="image/jpeg,image/png" required />
                          </label>
                          <button className="btn-suave btn-peq" type="submit">Enviar imagem</button>
                        </form>
                        <form action={excluirProdutoAction.bind(null, r.id, p.id)}>
                          <button className="btn-perigo" type="submit">Excluir produto</button>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 className="titulo-icone" id="novo-produto"><Icone nome="mais" tamanho={18} /> Novo produto</h3>
        {(pre.sku || voltarPedido) && (
          <p className="dica">Pré-preenchido a partir do pedido importado; ao salvar, os itens pendentes com este SKU são vinculados ao produto{voltarPedido && " e você volta para o pedido"}.</p>
        )}
        <form action={criarProdutoAction.bind(null, r.id)} className="grade">
          {voltarPedido && <input type="hidden" name="voltar_pedido" value={voltarPedido} />}
          <Campo label="SKU *" name="sku" required defaultValue={pre.sku} />
          <Campo label="Nome *" name="nome" required minLength={2} defaultValue={pre.nome} />
          <Campo label="Unidade" name="unidade" placeholder="un, cx, kg" />
          <Campo label="Categoria" name="categoria" placeholder="Ex.: Linha escolar" />
          <Campo label="NCM" name="ncm" inputMode="numeric" maxLength={10} placeholder="8 dígitos (opcional)" />
          <Campo label="Preço padrão *" name="preco" type="number" step="0.01" min="0" required defaultValue={pre.preco} />
          <Campo label="Desc. máx. (%)" name="desconto_max" type="number" step="0.01" min="0" max="100" defaultValue="0" />
          <Campo label="Comissão (%)" name="comissao" type="number" step="0.01" min="0" max="100" placeholder={r.comissao_percentual != null ? `Vazio = fixa ${formatarPercentual(Number(r.comissao_percentual))}` : "Vazio = sem comissão"} />
          <Campo label="Descrição" name="descricao" />
          <div className="acoes"><button className="btn" type="submit">Adicionar produto</button></div>
        </form>
      </section>
    </>
  );
}
