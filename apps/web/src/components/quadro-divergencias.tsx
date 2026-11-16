import Link from "next/link";
import { aprovarAlertaAction, aprovarTodosAction, alterarPrecoQuadroAction } from "@/app/app/pedidos/alertas-actions";
import { NIVEL_TIPO_ALERTA, ROTULO_STATUS_ALERTA, ROTULO_TIPO_ALERTA, STATUS_ALERTA, TIPOS_ALERTA } from "@/lib/comissao";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato";
import type { QuadroAlertas } from "@/server/alertas-pedido";
import { BotaoConfirmar } from "./botao-confirmar";
import { Icone } from "./icones";

/**
 * Fase 19 — quadro de divergências (topo da página Pedidos). Some sozinho quando não há alerta pendente (a não ser
 * que a URL traga filtro do quadro). Severidade: amarelo = desconto, laranja = preço, vermelho = comissão.
 * Toda ação redireciona de volta para a mesma visão (a página é renderizada de novo no servidor).
 */
export function QuadroDivergencias({ quadro, params }: { quadro: QuadroAlertas; params: Record<string, string> }) {
  const { filtro: f, linhas, resumo, totalPendentes, filtrando } = quadro;
  if (totalPendentes === 0 && !filtrando) return null;

  const url = (extra: Record<string, string | null>) => {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(extra)) { if (v == null) q.delete(k); else q.set(k, v); }
    q.delete("ok"); q.delete("erro");
    const s = q.toString();
    return `/app/pedidos${s ? `?${s}` : ""}`;
  };
  const voltar = url({});
  const aprovaveis = f.a_tipo ? resumo[f.a_tipo] : totalPendentes;
  const outrosFiltros = Object.entries(params).filter(([k]) => !k.startsWith("a_") && k !== "ok" && k !== "erro");

  return (
    <section className="card quadro-divergencias" id="divergencias" aria-labelledby="titulo-divergencias">
      <h2 id="titulo-divergencias" className="titulo-icone">
        <Icone nome="alerta" tamanho={20} /> Divergências{totalPendentes > 0 && ` · ${totalPendentes} pendente(s)`}
      </h2>
      <p className="dica">Pedidos importados por Excel não passam pela verificação de desconto e preço.</p>

      {totalPendentes > 0 && (
        <div className="cards-divergencias">
          {TIPOS_ALERTA.filter((t) => resumo[t] > 0).map((t) => (
            <Link key={t} className={`card-divergencia aviso-${NIVEL_TIPO_ALERTA[t]}`} href={`${url({ a_tipo: t, a_status: null })}#divergencias`}>
              <span>{t === "preco_divergente" ? "Preço divergente do catálogo" : ROTULO_TIPO_ALERTA[t]}</span>
              <strong>{resumo[t]}</strong>
              <span className="dica">pendente(s)</span>
            </Link>
          ))}
        </div>
      )}

      <form method="get" className="filtros-custos" action="/app/pedidos#divergencias">
        {outrosFiltros.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="campo">
          <span>Tipo</span>
          <select name="a_tipo" defaultValue={f.a_tipo ?? ""}>
            <option value="">Todos</option>
            {TIPOS_ALERTA.map((t) => <option key={t} value={t}>{ROTULO_TIPO_ALERTA[t]}</option>)}
          </select>
        </label>
        <label className="campo">
          <span>Status</span>
          <select name="a_status" defaultValue={f.a_status}>
            {STATUS_ALERTA.map((s) => <option key={s} value={s}>{ROTULO_STATUS_ALERTA[s]}</option>)}
          </select>
        </label>
        <label className="campo">
          <span>Ordenar por</span>
          <select name="a_ordem" defaultValue={f.a_ordem}>
            <option value="data">Data do pedido</option>
            <option value="diferenca">Valor da diferença</option>
          </select>
        </label>
        <div className="acoes-linha">
          <button className="btn-secundario btn-peq" type="submit"><Icone nome="filtro" tamanho={16} /> Filtrar</button>
          {filtrando && <Link className="btn-link" href={`${url({ a_tipo: null, a_status: null, a_ordem: null })}#divergencias`}>Limpar</Link>}
        </div>
      </form>

      {f.a_status === "pendente" && aprovaveis > 0 && (
        <form action={aprovarTodosAction.bind(null, f.a_tipo, voltar)} className="acoes-linha">
          <BotaoConfirmar className="btn-secundario btn-peq" texto={`Aprovar todos (${aprovaveis})`}
            pergunta={`Aprovar ${aprovaveis} alerta(s) pendente(s)${f.a_tipo ? ` de "${ROTULO_TIPO_ALERTA[f.a_tipo]}"` : ""}? Os pedidos não mudam.`} />
        </form>
      )}

      {linhas.length === 0 ? (
        <div className="vazio">{f.a_status === "pendente" ? "Não há discrepâncias pendentes." : "Nenhum alerta com esses filtros."}</div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Tipo</th><th>Pedido</th><th>Cliente</th><th>Produto</th><th>Data</th>
                <th className="num">Valor praticado</th><th className="num">Valor de referência</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((a) => {
                const rep = a.produto?.representada_id ?? a.valores.representada_id ?? a.pedido.representada_id;
                return (
                  <tr key={a.id}>
                    <td data-rotulo="Tipo"><span className={`selo-alerta aviso-${NIVEL_TIPO_ALERTA[a.tipo]}`}>{ROTULO_TIPO_ALERTA[a.tipo]}</span></td>
                    <td data-rotulo="Pedido"><Link href={`/app/pedidos/${a.pedido.id}`}>{a.pedido.codigo_pedido}</Link>{a.pedido.origem === "importacao" && <div className="dica">importado</div>}</td>
                    <td data-rotulo="Cliente">{a.pedido.cliente?.nome ?? "—"}</td>
                    <td data-rotulo="Produto">{a.produto ? <><code>{a.produto.sku}</code> {a.produto.nome}</> : "—"}</td>
                    <td data-rotulo="Data">{formatarData(a.pedido.data)}</td>
                    <td className="num" data-rotulo="Valor praticado">{a.praticado}</td>
                    <td className="num" data-rotulo="Valor de referência">{a.referencia}</td>
                    <td data-rotulo="Ações">
                      {a.status !== "pendente" ? (
                        <span className="dica">{ROTULO_STATUS_ALERTA[a.status]}{a.resolvido_em && ` em ${formatarDataHora(a.resolvido_em)}`}</span>
                      ) : (
                        <span className="acoes-linha">
                          <form action={aprovarAlertaAction.bind(null, a.id, voltar)}>
                            <button className="btn-link" type="submit">Aprovar</button>
                          </form>
                          {a.produto && <Link className="btn-link" href={`/app/pedidos/${a.pedido.id}/editar#item-${a.produto.id}`}>Corrigir pedido</Link>}
                          {a.tipo === "preco_divergente" && a.produto && a.valores.preco_praticado != null && (
                            <form action={alterarPrecoQuadroAction.bind(null, a.produto.id, Number(a.valores.preco_praticado), voltar)}>
                              <BotaoConfirmar className="btn-link" texto="Alterar preço no catálogo"
                                pergunta={`Alterar o preço de ${a.produto.sku} — ${a.produto.nome} no catálogo de ${formatarMoeda(Number(a.valores.preco_catalogo ?? 0))} para ${formatarMoeda(Number(a.valores.preco_praticado))} (preço praticado)? Os preços já gravados nos itens não mudam.`} />
                            </form>
                          )}
                          {a.tipo === "comissao_nao_definida" && (
                            <>
                              <Link className="btn-link" href={`/app/representadas/${rep}/editar`}>Definir comissão (Representada)</Link>
                              <Link className="btn-link" href={`/app/representadas/${rep}/catalogo`}>Definir no Catálogo</Link>
                            </>
                          )}
                          {a.tipo === "comissao_catalogo_sem_representada" && (
                            <Link className="btn-link" href={`/app/representadas/${rep}/editar`}>Definir na representada</Link>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
