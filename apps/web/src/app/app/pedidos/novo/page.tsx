import Link from "next/link";
import { Campo, Mensagens } from "@/components/form";
import { formatarMoeda, formatarPercentual } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { listarClientes } from "@/server/clientes";
import { listarTabelaPrecos } from "@/server/consultas";
import { listarProdutos } from "@/server/produtos";
import { listarRepresentadas } from "@/server/representadas";
import { criarPedidoAction } from "../actions";

export default async function NovoPedidoPage({
  searchParams,
}: {
  searchParams: Promise<{ representada?: string; cliente?: string; erro?: string }>;
}) {
  const { representada: repId, cliente: cliId, erro } = await searchParams;
  const [representadas, clientes] = await carregar((ctx) => Promise.all([listarRepresentadas(ctx), listarClientes(ctx)]));
  const rep = representadas.find((r) => r.id === repId);
  const cli = clientes.find((c) => c.id === cliId);

  // Preço do cliente (tabela específica) sobrepõe o padrão — mesma regra da função criar_pedido.
  const [produtos, precos] =
    rep && cli
      ? await carregar((ctx) => Promise.all([listarProdutos(ctx, rep.id), listarTabelaPrecos(ctx, rep.id)]))
      : [[], []];
  const precoCliente = new Map(
    precos.filter((t) => t.cliente?.id === cli?.id && t.produto).map((t) => [t.produto!.id, t] as const),
  );
  const ativos = produtos.filter((p) => p.ativo);

  return (
    <>
      <h1>Novo pedido</h1>
      <Mensagens erro={erro} />

      <section className="card">
        <h2>1. Representada e cliente</h2>
        <form method="get" className="grade">
          <label className="campo">
            <span>Representada *</span>
            <select name="representada" defaultValue={rep?.id ?? ""} required>
              <option value="" disabled>Selecione…</option>
              {representadas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Cliente *</span>
            <select name="cliente" defaultValue={cli?.id ?? ""} required>
              <option value="" disabled>Selecione…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <div className="acoes"><button className="btn" type="submit">Carregar catálogo</button></div>
        </form>
      </section>

      {rep && cli && (
        <section className="card">
          <h2>2. Itens — {rep.nome}</h2>
          {ativos.length === 0 ? (
            <p className="vazio">
              Nenhum produto ativo. Cadastre no <Link href={`/app/representadas/${rep.id}#catalogo`}>catálogo da representada</Link>.
            </p>
          ) : (
            <form action={criarPedidoAction}>
              <input type="hidden" name="representada_id" value={rep.id} />
              <input type="hidden" name="cliente_id" value={cli.id} />
              <div className="tabela-wrap">
                <table className="tabela">
                  <thead>
                    <tr><th>SKU</th><th>Produto</th><th>Preço</th><th>Comissão</th><th>Desc. máx.</th><th>Qtd.</th><th>Desconto (R$)</th></tr>
                  </thead>
                  <tbody>
                    {ativos.map((p) => {
                      const especifico = precoCliente.get(p.id);
                      return (
                        <tr key={p.id}>
                          <td><code>{p.sku}</code></td>
                          <td>{p.nome}{p.unidade && <span className="dica"> ({p.unidade})</span>}</td>
                          <td>
                            {formatarMoeda(especifico?.preco ?? p.preco)}
                            {especifico && <div className="dica">preço do cliente</div>}
                          </td>
                          <td>{formatarPercentual(p.comissao)}</td>
                          <td>{formatarPercentual(especifico?.desconto_max ?? p.desconto_max)}</td>
                          <td><input className="input-num" name={`qtd_${p.id}`} type="number" min="0" step="any" defaultValue="0" /></td>
                          <td><input className="input-num" name={`desc_${p.id}`} type="number" min="0" step="0.01" defaultValue="0" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="grade" style={{ marginTop: 12 }}>
                <Campo label="Forma de pagamento" name="forma_pagamento" placeholder="Ex.: boleto 30/60" />
                <div className="acoes acoes-linha">
                  <button className="btn" type="submit" name="confirmar" value="1">Confirmar pedido</button>
                  <button className="btn-link" type="submit" name="confirmar" value="0">Salvar rascunho</button>
                </div>
              </div>
              <p className="dica">Totais e comissões são calculados no servidor ao salvar, pela comissão de cada produto.</p>
            </form>
          )}
        </section>
      )}
    </>
  );
}
