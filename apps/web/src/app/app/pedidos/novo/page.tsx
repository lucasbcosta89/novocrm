import Link from "next/link";
import { CodigoPedido } from "@/components/codigo-pedido";
import { Mensagens } from "@/components/form";
import { Icone } from "@/components/icones";
import { CampoDataFaturamento } from "@/components/data-faturamento";
import { ItensEditaveis, type LinhaEdicao } from "@/components/itens-editaveis";
import { carregar } from "@/server/acao";
import { listarClientes } from "@/server/clientes";
import { listarTabelaPrecos } from "@/server/consultas";
import { proximoCodigoPedido } from "@/server/pedidos";
import { listarProdutos } from "@/server/produtos";
import { listarRepresentadas } from "@/server/representadas";
import { PagamentoPedido } from "@/components/pagamento-pedido";
import { criarPedidoAction } from "../actions";

export default async function NovoPedidoPage({
  searchParams,
}: {
  searchParams: Promise<{ representada?: string; cliente?: string; erro?: string }>;
}) {
  const { representada: repId, cliente: cliId, erro } = await searchParams;
  const [representadas, clientes] = await carregar((ctx) => Promise.all([listarRepresentadas(ctx), listarClientes(ctx)]));
  // representada inativa não aparece no seletor de novo pedido (histórico e vínculos continuam visíveis)
  const ativas = representadas.filter((r) => r.status === "ativa");
  const rep = ativas.find((r) => r.id === repId);
  const cli = clientes.find((c) => c.id === cliId);

  // Preço do cliente (tabela específica) sobrepõe o padrão — mesma regra da função criar_pedido.
  const [produtos, precos, proximo] =
    rep && cli
      ? await carregar((ctx) => Promise.all([listarProdutos(ctx, rep.id), listarTabelaPrecos(ctx, rep.id), proximoCodigoPedido(ctx)]))
      : [[], [], ""];
  const precoCliente = new Map(
    precos.filter((t) => t.cliente?.id === cli?.id && t.produto).map((t) => [t.produto!.id, t] as const),
  );
  const ativos = produtos.filter((p) => p.ativo);
  // Fase 19: dados dos avisos (preço de referência, desconto máximo e comissão do catálogo); nada é gravado aqui
  const linhas: LinhaEdicao[] = ativos.map((p) => {
    const especifico = precoCliente.get(p.id);
    const preco = Number(especifico?.preco ?? p.preco);
    return {
      produto_id: p.id, sku: p.sku, nome: p.unidade ? `${p.nome} (${p.unidade})` : p.nome, inativo: false, quantidade: 0, preco, desconto: 0, acrescimo: 0,
      desconto_max: Number(especifico?.desconto_max ?? p.desconto_max ?? 0), preco_catalogo: preco, comissao_catalogo: p.comissao == null ? null : Number(p.comissao),
      dica_preco: especifico ? "preço do cliente" : undefined,
    };
  });
  const semComissao = produtos.filter((p) => !(Number(p.comissao ?? 0) > 0)).length;
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  return (
    <>
      <h1 className="titulo-icone"><Icone nome="carrinho" tamanho={24} /> Novo pedido</h1>
      <Mensagens erro={erro} />

      <section className="card">
        <h2 className="titulo-icone"><Icone nome="pessoas" tamanho={20} /> 1. Representada e cliente</h2>
        <form method="get" className="grade">
          <label className="campo">
            <span>Representada *</span>
            <select name="representada" defaultValue={rep?.id ?? ""} required>
              <option value="" disabled>Selecione…</option>
              {ativas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
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
          <h2 className="titulo-icone"><Icone nome="pacote" tamanho={20} /> 2. Itens — {rep.nome}</h2>
          {ativos.length === 0 ? (
            <p className="vazio">
              Nenhum produto ativo. Cadastre no <Link href={`/app/representadas/${rep.id}/catalogo`}>catálogo da representada</Link>.
            </p>
          ) : (
            <form action={criarPedidoAction}>
              <input type="hidden" name="representada_id" value={rep.id} />
              <input type="hidden" name="cliente_id" value={cli.id} />
              <div className="grade">
                <div className="bloco-codigo-pedido"><CodigoPedido proximo={proximo} /></div>
                <label className="campo"><span>Data do pedido</span><input type="date" value={hoje} disabled aria-describedby="data-pedido-dica" /><small id="data-pedido-dica" className="dica">Gravada ao salvar.</small></label>
                <CampoDataFaturamento dataPedido={hoje} />
              </div>
              <ItensEditaveis linhas={linhas} comAcrescimo precoFixo
                avisos={{ manual: true, representadaId: rep.id, comissaoRepresentada: rep.comissao_percentual == null ? null : Number(rep.comissao_percentual), produtosSemComissao: semComissao }} />
              <div className="grade" style={{ marginTop: 12 }}>
                <PagamentoPedido />
                <div className="acoes acoes-linha">
                  <button className="btn" type="submit" name="confirmar" value="1"><Icone nome="check" tamanho={16} /> Confirmar pedido</button>
                  <button className="btn-link" type="submit" name="confirmar" value="0">Salvar rascunho</button>
                </div>
              </div>
              <p className="dica">Desconto em % sobre o item (até o desconto máximo da tabela). Acréscimo em % para vender acima do preço de tabela. Subtotal = qtd × preço × (1 + acréscimo%) × (1 − desconto%); o total do pedido é a soma dos subtotais.</p>
            </form>
          )}
        </section>
      )}
    </>
  );
}
