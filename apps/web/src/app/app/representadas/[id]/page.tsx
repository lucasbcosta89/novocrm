import Link from "next/link";
import { Campo, Mensagens, type Busca } from "@/components/form";
import { TabelaPedidos } from "@/components/tabelas";
import { formatarDocumento, formatarMoeda, formatarPercentual } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { listarClientesDaRepresentada, listarPedidos, listarTabelaPrecos, resumoRepresentada } from "@/server/consultas";
import { enviarCatalogoAction } from "../../whatsapp-actions";
import { listarProdutos } from "@/server/produtos";
import { obterRepresentada } from "@/server/representadas";
import {
  atualizarProdutoAction,
  atualizarRepresentadaAction,
  criarProdutoAction,
  excluirProdutoAction,
  excluirRepresentadaAction,
  imagemProdutoAction,
} from "../actions";

export default async function RepresentadaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Busca;
}) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const [r, produtos, precos, pedidos, resumo, vinculados] = await carregar((ctx) =>
    Promise.all([
      obterRepresentada(ctx, id),
      listarProdutos(ctx, id),
      listarTabelaPrecos(ctx, id),
      listarPedidos(ctx, { representada_id: id }),
      resumoRepresentada(ctx, id),
      listarClientesDaRepresentada(ctx, id),
    ]),
  );

  return (
    <>
      <p className="trilha"><Link href="/app/representadas">Representadas</Link> /</p>
      <h1>{r.nome}</h1>
      <nav className="ancoras">
        <a href="#geral">Visão geral</a><a href="#catalogo">Catálogo</a><a href="#precos">Tabela de preços</a><a href="#pedidos">Pedidos</a>
      </nav>
      <Mensagens erro={erro} ok={ok} />

      <section className="card" id="geral">
        <h2>Visão geral</h2>
        <dl className="resumo">
          <div><dt>CNPJ</dt><dd>{formatarDocumento(r.cnpj)}</dd></div>
          <div><dt>Comissão padrão (novos produtos)</dt><dd>{formatarPercentual(r.comissao_padrao)}</dd></div>
          <div><dt>Clientes vinculados</dt><dd>{resumo.clientes}</dd></div>
          <div><dt>Produtos</dt><dd>{resumo.produtos}</dd></div>
          <div><dt>Pedidos</dt><dd>{resumo.pedidos}</dd></div>
        </dl>
        <div>
          {r.catalogo_publico ? (
            <>
              <a className="btn" href={`/c/${r.slug}`} target="_blank" rel="noopener noreferrer">Abrir catálogo digital</a>
              <small className="dica"> /c/{r.slug} · {r.criar_pedido_publico ? "aceitando pedidos" : "somente vitrine"}</small>
            </>
          ) : (
            <small className="dica">Catálogo digital desativado — ative em “Editar dados”.</small>
          )}
        </div>
        {r.catalogo_publico && vinculados.length > 0 && (
          <form action={enviarCatalogoAction.bind(null, r.id, `/app/representadas/${r.id}`)} className="inline">
            <label className="campo">
              <span>Enviar catálogo via WhatsApp para</span>
              <select name="cliente_id" required defaultValue="">
                <option value="" disabled>Selecione o cliente…</option>
                {vinculados.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <button className="btn btn-peq" type="submit">Enviar</button>
          </form>
        )}
        <details>
          <summary>Editar dados</summary>
        <form action={atualizarRepresentadaAction.bind(null, r.id)} className="grade">
          <Campo label="Nome *" name="nome" required minLength={2} defaultValue={r.nome} />
          <Campo label="CNPJ" name="cnpj" inputMode="numeric" defaultValue={r.cnpj ?? ""} />
          <Campo label="Comissão padrão (%)" name="comissao_padrao" type="number" step="0.01" min="0" max="100" defaultValue={r.comissao_padrao} />
          <Campo label="Slug (catálogo público)" value={r.slug} readOnly disabled />
          <label className="check"><input type="checkbox" name="catalogo_publico" defaultChecked={r.catalogo_publico} /> Catálogo digital público</label>
          <label className="check"><input type="checkbox" name="criar_pedido_publico" defaultChecked={r.criar_pedido_publico} /> Aceitar pedidos pelo catálogo</label>
          <div className="acoes"><button className="btn" type="submit">Salvar</button></div>
        </form>
        <form action={excluirRepresentadaAction.bind(null, r.id)}>
          <button className="btn-perigo" type="submit">Excluir representada</button>
        </form>
        </details>
      </section>

      <section className="card" id="catalogo">
        <h2>Catálogo (produtos)</h2>
        {produtos.length === 0 ? (
          <div className="vazio">Nenhum produto.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th></th><th>SKU</th><th>Nome</th><th>Categoria</th><th>Un.</th><th>Preço padrão</th><th>Desc. máx.</th><th>Comissão</th><th>Ativo</th><th></th></tr>
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
                    <td>{p.unidade ?? "—"}</td>
                    <td>{formatarMoeda(p.preco)}</td>
                    <td>{formatarPercentual(p.desconto_max)}</td>
                    <td>{formatarPercentual(p.comissao)}</td>
                    <td>{p.ativo ? "Sim" : "Não"}</td>
                    <td>
                      <details>
                        <summary>Editar</summary>
                        <form action={atualizarProdutoAction.bind(null, r.id, p.id)} className="grade">
                          <Campo label="SKU *" name="sku" required defaultValue={p.sku} />
                          <Campo label="Nome *" name="nome" required defaultValue={p.nome} />
                          <Campo label="Unidade" name="unidade" defaultValue={p.unidade ?? ""} />
                          <Campo label="Categoria" name="categoria" defaultValue={p.categoria ?? ""} />
                          <Campo label="Preço *" name="preco" type="number" step="0.01" min="0" required defaultValue={p.preco} />
                          <Campo label="Desc. máx. (%)" name="desconto_max" type="number" step="0.01" min="0" max="100" defaultValue={p.desconto_max} />
                          <Campo label="Comissão (%)" name="comissao" type="number" step="0.01" min="0" max="100" defaultValue={p.comissao} />
                          <Campo label="Descrição" name="descricao" defaultValue={p.descricao ?? ""} />
                          <label className="check"><input type="checkbox" name="ativo" defaultChecked={p.ativo} /> Ativo</label>
                          <div className="acoes"><button className="btn" type="submit">Salvar</button></div>
                        </form>
                        <form action={imagemProdutoAction.bind(null, r.id, p.id)} className="inline">
                          <label className="campo">
                            <span>Imagem (JPEG/PNG até 2 MB)</span>
                            <input type="file" name="imagem" accept="image/jpeg,image/png" required />
                          </label>
                          <button className="btn btn-peq" type="submit">Enviar imagem</button>
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

        <h3>Novo produto</h3>
        <form action={criarProdutoAction.bind(null, r.id)} className="grade">
          <Campo label="SKU *" name="sku" required />
          <Campo label="Nome *" name="nome" required minLength={2} />
          <Campo label="Unidade" name="unidade" placeholder="un, cx, kg" />
          <Campo label="Categoria" name="categoria" placeholder="Ex.: Linha escolar" />
          <Campo label="Preço padrão *" name="preco" type="number" step="0.01" min="0" required />
          <Campo label="Desc. máx. (%)" name="desconto_max" type="number" step="0.01" min="0" max="100" defaultValue="0" />
          <Campo label="Comissão (%)" name="comissao" type="number" step="0.01" min="0" max="100" defaultValue={r.comissao_padrao} />
          <Campo label="Descrição" name="descricao" />
          <div className="acoes"><button className="btn" type="submit">Adicionar produto</button></div>
        </form>
      </section>

      <section className="card" id="precos">
        <h2>Tabela de preços</h2>
        {precos.length === 0 ? (
          <div className="vazio">Sem preços cadastrados.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Tabela</th><th>SKU</th><th>Produto</th><th>Preço</th><th>Desc. máx.</th></tr>
              </thead>
              <tbody>
                {precos.map((t) => (
                  <tr key={t.id}>
                    <td>{t.cliente ? <Link href={`/app/clientes/${t.cliente.id}`}>{t.cliente.nome}</Link> : "Padrão"}</td>
                    <td><code>{t.produto?.sku}</code></td>
                    <td>{t.produto?.nome}</td>
                    <td>{formatarMoeda(t.preco)}</td>
                    <td>{formatarPercentual(t.desconto_max ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" id="pedidos">
        <div className="cabecalho">
          <h2>Pedidos</h2>
          <Link className="btn btn-peq" href={`/app/pedidos/novo?representada=${r.id}`}>+ Novo pedido</Link>
        </div>
        <TabelaPedidos pedidos={pedidos} coluna="cliente" />
      </section>
    </>
  );
}
