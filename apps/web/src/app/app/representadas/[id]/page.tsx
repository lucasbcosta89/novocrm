import Link from "next/link";
import { Campo, Mensagens, type Busca } from "@/components/form";
import { formatarMoeda, formatarPercentual } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { listarProdutos } from "@/server/produtos";
import { obterRepresentada } from "@/server/representadas";
import {
  atualizarProdutoAction,
  atualizarRepresentadaAction,
  criarProdutoAction,
  excluirProdutoAction,
  excluirRepresentadaAction,
} from "../actions";

export default async function RepresentadaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Busca;
}) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const [r, produtos] = await carregar((ctx) => Promise.all([obterRepresentada(ctx, id), listarProdutos(ctx, id)]));

  return (
    <>
      <p className="trilha"><Link href="/app/representadas">Representadas</Link> /</p>
      <h1>{r.nome}</h1>
      <Mensagens erro={erro} ok={ok} />

      <section className="card">
        <h2>Dados</h2>
        <form action={atualizarRepresentadaAction.bind(null, r.id)} className="grade">
          <Campo label="Nome *" name="nome" required minLength={2} defaultValue={r.nome} />
          <Campo label="CNPJ" name="cnpj" inputMode="numeric" defaultValue={r.cnpj ?? ""} />
          <Campo label="Comissão padrão (%)" name="comissao_padrao" type="number" step="0.01" min="0" max="100" defaultValue={r.comissao_padrao} />
          <Campo label="Slug (catálogo público)" value={r.slug} readOnly disabled />
          <div className="acoes"><button className="btn" type="submit">Salvar</button></div>
        </form>
        <form action={excluirRepresentadaAction.bind(null, r.id)}>
          <button className="btn-perigo" type="submit">Excluir representada</button>
        </form>
      </section>

      <section className="card">
        <h2>Produtos e tabela de preço padrão</h2>
        {produtos.length === 0 ? (
          <div className="vazio">Nenhum produto.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>SKU</th><th>Nome</th><th>Un.</th><th>Preço padrão</th><th>Desc. máx.</th><th>Ativo</th><th></th></tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id}>
                    <td><code>{p.sku}</code></td>
                    <td>{p.nome}</td>
                    <td>{p.unidade ?? "—"}</td>
                    <td>{formatarMoeda(p.preco)}</td>
                    <td>{formatarPercentual(p.desconto_max)}</td>
                    <td>{p.ativo ? "Sim" : "Não"}</td>
                    <td>
                      <details>
                        <summary>Editar</summary>
                        <form action={atualizarProdutoAction.bind(null, r.id, p.id)} className="grade">
                          <Campo label="SKU *" name="sku" required defaultValue={p.sku} />
                          <Campo label="Nome *" name="nome" required defaultValue={p.nome} />
                          <Campo label="Unidade" name="unidade" defaultValue={p.unidade ?? ""} />
                          <Campo label="Preço *" name="preco" type="number" step="0.01" min="0" required defaultValue={p.preco} />
                          <Campo label="Desc. máx. (%)" name="desconto_max" type="number" step="0.01" min="0" max="100" defaultValue={p.desconto_max} />
                          <Campo label="Descrição" name="descricao" defaultValue={p.descricao ?? ""} />
                          <label className="check"><input type="checkbox" name="ativo" defaultChecked={p.ativo} /> Ativo</label>
                          <div className="acoes"><button className="btn" type="submit">Salvar</button></div>
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
          <Campo label="Preço padrão *" name="preco" type="number" step="0.01" min="0" required />
          <Campo label="Desc. máx. (%)" name="desconto_max" type="number" step="0.01" min="0" max="100" defaultValue="0" />
          <Campo label="Descrição" name="descricao" />
          <div className="acoes"><button className="btn" type="submit">Adicionar produto</button></div>
        </form>
      </section>
    </>
  );
}
