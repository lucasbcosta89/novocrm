import { DocumentosRecentes } from "@/components/documentos-recentes";
import { EnviarCatalogo } from "@/components/enviar-catalogo";
import { Campo, Mensagens, type Busca } from "@/components/form";
import { AvisoLimite } from "@/components/limite";
import { formatarMoeda, formatarPercentual } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { listarClientesDaRepresentada } from "@/server/consultas";
import { listarDocumentos } from "@/server/documentos";
import { listarProdutos } from "@/server/produtos";
import { obterUso } from "@/server/quota";
import { obterRepresentada } from "@/server/representadas";
import { atualizarProdutoAction, criarProdutoAction, excluirProdutoAction, imagemProdutoAction } from "../../actions";
import { gerarDocumentoAction } from "../../documentos-actions";

/** Catálogo: produtos + Gerar Catálogo (PDF) e Enviar por WhatsApp (Fase 7c). */
export default async function RepresentadaCatalogo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const [r, produtos, vinculados, documentos, uso] = await carregar((ctx) =>
    Promise.all([
      obterRepresentada(ctx, id),
      listarProdutos(ctx, id),
      listarClientesDaRepresentada(ctx, id),
      listarDocumentos(ctx, { representada_id: id }, 5),
      obterUso(ctx),
    ]),
  );
  const aqui = `/app/representadas/${r.id}/catalogo`;

  return (
    <>
      <Mensagens erro={erro} ok={ok} />
      <section className="card">
        <h2>Catálogo</h2>
        <AvisoLimite uso={uso} recurso="pdf_mes" />
        <div className="acoes-linha">
          <form action={gerarDocumentoAction.bind(null, aqui)}>
            <input type="hidden" name="tipo" value="catalogo" />
            <input type="hidden" name="representada_id" value={r.id} />
            <button className="btn btn-peq" type="submit" disabled={uso.recursos.pdf_mes.atingido}>Gerar Catálogo (PDF)</button>
          </form>
          {r.catalogo_publico && vinculados.length > 0 ? (
            <EnviarCatalogo representadaId={r.id} clientes={vinculados} />
          ) : (
            <small className="dica">{r.catalogo_publico ? "Vincule clientes para enviar o catálogo." : "Ative o catálogo digital (Início → Editar dados) para enviar por WhatsApp."}</small>
          )}
        </div>
        <DocumentosRecentes documentos={documentos} />
      </section>

      <section className="card">
        <h2>Produtos</h2>
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
          <Campo label="Comissão (%)" name="comissao" type="number" step="0.01" min="0" max="100" defaultValue="0" />
          <Campo label="Descrição" name="descricao" />
          <div className="acoes"><button className="btn" type="submit">Adicionar produto</button></div>
        </form>
      </section>
    </>
  );
}
