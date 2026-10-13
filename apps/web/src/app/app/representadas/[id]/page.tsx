import { Campo, Mensagens, type Busca } from "@/components/form";
import { PainelResumo } from "@/components/painel";
import { formatarDocumento, formatarPercentual } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { resumoRepresentada } from "@/server/consultas";
import { painelRepresentada } from "@/server/dashboards";
import { obterRepresentada } from "@/server/representadas";
import { atualizarRepresentadaAction, excluirRepresentadaAction } from "../actions";

/** Página inicial da representada: dashboard (vendas, visitas, alertas) + dados cadastrais. */
export default async function RepresentadaInicio({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const [r, resumo, painel] = await carregar((ctx) => Promise.all([obterRepresentada(ctx, id), resumoRepresentada(ctx, id), painelRepresentada(ctx, id)]));

  return (
    <>
      <Mensagens erro={erro} ok={ok} />
      <PainelResumo painel={painel} rotuloVisitas="Visitas (representada e clientes)" />

      <section className="card">
        <h2>Dados da representada</h2>
        <dl className="resumo">
          <div><dt>CNPJ</dt><dd>{formatarDocumento(r.cnpj)}</dd></div>
          <div><dt>Comissão padrão (novos produtos)</dt><dd>{formatarPercentual(r.comissao_padrao)}</dd></div>
          <div><dt>Clientes vinculados</dt><dd>{resumo.clientes}</dd></div>
          <div><dt>Produtos</dt><dd>{resumo.produtos}</dd></div>
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
    </>
  );
}
