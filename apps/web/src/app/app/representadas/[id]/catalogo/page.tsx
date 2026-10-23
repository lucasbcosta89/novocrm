import { BotaoCatalogoPdf, BotaoCatalogoWeb } from "@/components/catalogo-acoes";
import { EnviarCatalogo } from "@/components/enviar-catalogo";
import { Campo, Mensagens, type Busca } from "@/components/form";
import { AvisoLimite } from "@/components/limite";
import { formatarMoeda, formatarPercentual } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { listarClientesDaRepresentada } from "@/server/consultas";
import { listarProdutos } from "@/server/produtos";
import { obterUso } from "@/server/quota";
import { obterRepresentada } from "@/server/representadas";
import { atualizarProdutoAction, criarProdutoAction, excluirProdutoAction, imagemProdutoAction } from "../../actions";
import { Icone } from "@/components/icones";
import { ModalImportarProdutos } from "./_components/ModalImportarProdutos";

/** Catálogo: produtos + Gerar Catálogo (PDF) e Enviar por WhatsApp (Fase 7c). */
export default async function RepresentadaCatalogo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const [r, produtos, vinculados, uso] = await carregar((ctx) =>
    Promise.all([
      obterRepresentada(ctx, id),
      listarProdutos(ctx, id),
      listarClientesDaRepresentada(ctx, id),
      obterUso(ctx),
    ]),
  );

  return (
    <>
      <Mensagens erro={erro} ok={ok} />
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
                          <Campo label="NCM" name="ncm" inputMode="numeric" maxLength={10} placeholder="8 dígitos" defaultValue={p.ncm ?? ""} />
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

        <h3 className="titulo-icone"><Icone nome="mais" tamanho={18} /> Novo produto</h3>
        <form action={criarProdutoAction.bind(null, r.id)} className="grade">
          <Campo label="SKU *" name="sku" required />
          <Campo label="Nome *" name="nome" required minLength={2} />
          <Campo label="Unidade" name="unidade" placeholder="un, cx, kg" />
          <Campo label="Categoria" name="categoria" placeholder="Ex.: Linha escolar" />
          <Campo label="NCM" name="ncm" inputMode="numeric" maxLength={10} placeholder="8 dígitos (opcional)" />
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
