import Link from "next/link";
import { Icone } from "@/components/icones";
import { ItensEditaveis, type LinhaEdicao } from "@/components/itens-editaveis";
import { PagamentoPedido } from "@/components/pagamento-pedido";
import { ROTULO_MOTIVO_DEVOLUCAO, ROTULO_STATUS_DEVOLUCAO } from "@/lib/rotulos";
import { MOTIVOS_DEVOLUCAO, STATUS_DEVOLUCAO } from "@/lib/validacao";
import { carregar } from "@/server/acao";
import { listarPedidos, listarTabelaPrecos } from "@/server/consultas";
import { devolvidoNoPedido, type Devolucao } from "@/server/devolucoes";
import { obterPedido } from "@/server/pedidos";
import { listarProdutos } from "@/server/produtos";
import { salvarDevolucaoAction } from "./actions";

type Cliente = { id: string; nome: string; representadas: { id: string; nome: string }[] };

const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/**
 * Formulário de devolução (registrar e editar) com os mesmos campos do pedido.
 * Passo 1 (só ao registrar): pedido de origem (opcional) e representada. Com pedido, os itens dele vêm
 * pré-carregados com a quantidade ainda devolvível como limite; sem pedido, o catálogo da representada.
 */
export async function FormDevolucao({ cliente, devolucao, representadaId, pedidoId }: {
  cliente: Cliente; devolucao?: Devolucao; representadaId?: string; pedidoId?: string;
}) {
  const pedidos = (await carregar((ctx) => listarPedidos(ctx, { cliente_id: cliente.id }))).filter((p) => p.status !== "cancelado");
  const pedidoSel = devolucao ? devolucao.pedido?.id : pedidos.find((p) => p.id === pedidoId)?.id;
  const pedido = pedidoSel ? await carregar((ctx) => obterPedido(ctx, pedidoSel)) : null;

  // representadas do cliente (vínculo) + as que aparecem nos pedidos dele
  const representadas = [...new Map([
    ...cliente.representadas.map((r) => [r.id, r] as const),
    ...pedidos.flatMap((p) => (p.representada ? [[p.representada.id, p.representada] as const] : [])),
  ]).values()].sort((a, b) => a.nome.localeCompare(b.nome));
  const rep = devolucao?.representada ?? pedido?.representada ?? representadas.find((r) => r.id === representadaId) ?? null;

  const base = `/app/clientes/${cliente.id}/devolucoes`;
  const voltar = devolucao
    ? `${base}/${devolucao.id}/editar`
    : `${base}/nova?${new URLSearchParams({ ...(rep ? { representada: rep.id } : {}), ...(pedido ? { pedido: pedido.id } : {}) })}`;

  let linhas: LinhaEdicao[] = [];
  if (rep) {
    const itemDev = new Map((devolucao?.itens ?? []).map((i) => [i.produto_id, i] as const));
    if (pedido) {
      const ja = await carregar((ctx) => devolvidoNoPedido(ctx, pedido.id, devolucao?.id));
      // soma por produto (o pedido pode repetir o produto em mais de uma linha)
      const porProduto = new Map<string, { sku: string; nome: string; qtd: number; preco: number; desconto: number }>();
      for (const i of pedido.itens) {
        if (!i.produto_id) continue;
        const atual = porProduto.get(i.produto_id);
        porProduto.set(i.produto_id, {
          sku: i.produto?.sku ?? "—", nome: i.descricao ?? "—", qtd: (atual?.qtd ?? 0) + Number(i.quantidade),
          preco: Number(i.preco_unitario), desconto: Number(i.desconto_percentual),
        });
      }
      linhas = [...porProduto.entries()].map(([produto_id, i]) => {
        const max = Math.max(0, Math.round((i.qtd - (ja.get(produto_id) ?? 0)) * 1000) / 1000);
        const dev = itemDev.get(produto_id);
        return {
          produto_id, sku: i.sku, nome: i.nome, inativo: false, max, desconto_max: 100,
          quantidade: dev ? Number(dev.quantidade) : devolucao ? 0 : max,
          preco: dev ? Number(dev.preco_unitario) : i.preco,
          desconto: dev ? Number(dev.desconto_percentual) : i.desconto,
        };
      });
    } else {
      const [produtos, precos] = await carregar((ctx) => Promise.all([listarProdutos(ctx, rep.id), listarTabelaPrecos(ctx, rep.id)]));
      const precoCliente = new Map(precos.filter((t) => t.cliente?.id === cliente.id && t.produto).map((t) => [t.produto!.id, t] as const));
      linhas = produtos
        .filter((p) => p.ativo || itemDev.has(p.id))
        .map((p) => {
          const dev = itemDev.get(p.id);
          const tabela = precoCliente.get(p.id);
          return {
            produto_id: p.id, sku: p.sku, nome: p.nome, inativo: !p.ativo,
            quantidade: dev ? Number(dev.quantidade) : 0,
            preco: dev ? Number(dev.preco_unitario) : Number(tabela?.preco ?? p.preco ?? 0),
            desconto: dev ? Number(dev.desconto_percentual) : 0,
            desconto_max: Number(tabela?.desconto_max ?? p.desconto_max ?? 0),
          };
        })
        .sort((a, b) => Number(b.quantidade > 0) - Number(a.quantidade > 0) || a.nome.localeCompare(b.nome));
    }
  }

  const forma = devolucao?.forma_pagamento ?? pedido?.forma_pagamento ?? null;
  const prazoTipo = devolucao?.prazo_tipo ?? pedido?.prazo_tipo ?? "a_vista";
  const prazoDias = devolucao?.prazo_dias ?? pedido?.prazo_dias ?? null;

  return (
    <>
      {!devolucao && (
        <section className="card">
          <h2 className="titulo-icone"><Icone nome="recibo" tamanho={20} /> 1. Origem</h2>
          {pedidos.length === 0 && (
            <p className="aviso aviso-alerta"><span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>Este cliente não tem pedidos: a devolução será avulsa.</p>
          )}
          <form method="get" className="grade">
            {pedidos.length > 0 && (
              <label className="campo">
                <span>Pedido de origem (opcional)</span>
                <select name="pedido" defaultValue={pedido?.id ?? ""}>
                  <option value="">Sem pedido (devolução avulsa)</option>
                  {pedidos.map((p) => <option key={p.id} value={p.id}>{p.codigo_pedido} · {p.representada?.nome ?? "—"}</option>)}
                </select>
              </label>
            )}
            <label className="campo">
              <span>Representada {pedidos.length > 0 ? "(devolução avulsa)" : "*"}</span>
              <select name="representada" defaultValue={rep?.id ?? ""}>
                <option value="">Selecione…</option>
                {representadas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
            </label>
            <div className="acoes"><button className="btn-secundario" type="submit">Carregar itens</button></div>
          </form>
        </section>
      )}

      {rep && (
        <form action={salvarDevolucaoAction.bind(null, cliente.id, devolucao?.id ?? null, voltar)} className="card">
          <input type="hidden" name="representada_id" value={rep.id} />
          <input type="hidden" name="pedido_id" value={pedido?.id ?? ""} />
          <h2 className="titulo-icone">
            <Icone nome="pacote" tamanho={20} /> {devolucao ? "Itens" : "2. Itens"} — {rep.nome}
            {pedido && <span className="dica"> · pedido {pedido.codigo_pedido}</span>}
          </h2>
          <div className="grade">
            <label className="campo"><span>Data *</span><input type="date" name="data" defaultValue={devolucao?.data ?? hoje()} required /></label>
            <label className="campo">
              <span>Motivo *</span>
              <select name="motivo" defaultValue={devolucao?.motivo ?? ""} required>
                <option value="" disabled>Selecione…</option>
                {MOTIVOS_DEVOLUCAO.map((m) => <option key={m} value={m}>{ROTULO_MOTIVO_DEVOLUCAO[m]}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Status</span>
              <select name="status" defaultValue={devolucao?.status ?? "pendente"}>
                {STATUS_DEVOLUCAO.map((s) => <option key={s} value={s}>{ROTULO_STATUS_DEVOLUCAO[s]}</option>)}
              </select>
            </label>
          </div>
          {linhas.length === 0 ? (
            <p className="vazio">{pedido ? "Os itens deste pedido não têm produto do catálogo vinculado." : "Nenhum produto ativo nesta representada."}</p>
          ) : (
            <ItensEditaveis linhas={linhas} documento="devolução" />
          )}
          <h2 className="titulo-icone"><Icone nome="cartao" tamanho={20} /> Pagamento</h2>
          <div className="grade">
            <PagamentoPedido forma={forma} prazoTipo={prazoTipo} prazoDias={prazoDias} />
            <label className="campo"><span>Observações</span><textarea name="observacoes" rows={3} maxLength={2000} defaultValue={devolucao?.observacoes ?? ""} /></label>
          </div>
          <div className="acoes-linha">
            <button className="btn" type="submit"><Icone nome="check" tamanho={16} /> {devolucao ? "Salvar alterações" : "Registrar devolução"}</button>
            <Link className="btn-link" href={base}>Cancelar</Link>
          </div>
        </form>
      )}
    </>
  );
}
