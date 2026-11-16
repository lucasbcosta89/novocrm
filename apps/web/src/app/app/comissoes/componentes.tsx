"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icone } from "@/components/icones";
import { MultiSelect, type OpcaoMulti } from "@/components/multi-select";
import { ATALHOS_COMISSOES, ROTULO_ATALHO } from "@/lib/custos";
import { CAMPOS_DATA, ROTULOS_CAMPO_DATA } from "@/lib/comissoes/filtro";
import {
  acoesDoStatus, COMPLETUDES, GRUPOS_STATUS, ROTULOS_TIPO, MOTIVOS_PENDENCIA, ROTULOS_COMPLETUDE, ROTULOS_GRUPO, ROTULOS_MOTIVO, ROTULOS_ORIGEM, rotuloMotivo, rotuloStatus,
  statusNoGrupo, type OrigemCalculo,
} from "@/lib/comissoes/status";
import { formatarMoeda, formatarPercentual } from "@/lib/formato";
import {
  aprovarLoteAction, atualizarDataAction, definirComissaoAction, editadasNoLoteAction, marcarRecebidaAction, reabrirComissaoAction, reabrirLoteAction,
  resumoSelecaoAction,
  processarDevolucoesAction, reabrirDevolucaoAction, resumoProcessamentoAction,
} from "./actions";

const LIMITE_LOTE = 2000;
const dia = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/* ---------- Filtro (P) ---------- */

export function FiltroComissoes({ filtro, representadas, clientes, ativos, visao }: {
  filtro: { p: string; de: string; ate: string; campo: string; g: string[]; comp: string; mot: string; rep: string[]; cli: string[]; lote: boolean; ed: boolean; tipo: string };
  representadas: OpcaoMulti[]; clientes: OpcaoMulti[]; ativos: number; visao: string;
}) {
  const [periodo, setPeriodo] = useState(filtro.p);
  const form = useRef<HTMLFormElement>(null);
  const enviar = () => form.current?.requestSubmit();
  return (
    <form ref={form} method="get" className="card filtros-custos filtros-comissoes">
      {visao !== "lista" && <input type="hidden" name="visao" value={visao} />}
      <label className="campo">
        <span>Período</span>
        <select name="p" value={periodo} onChange={(e) => { setPeriodo(e.target.value); if (e.target.value !== "personalizado") setTimeout(enviar); }}>
          {ATALHOS_COMISSOES.map((a) => <option key={a} value={a}>{ROTULO_ATALHO[a]}</option>)}
        </select>
      </label>
      {periodo === "personalizado" && (
        <>
          <label className="campo"><span>De</span><input type="date" name="de" defaultValue={filtro.de} required /></label>
          <label className="campo"><span>Até</span><input type="date" name="ate" defaultValue={filtro.ate} required /></label>
        </>
      )}
      <label className="campo">
        <span>Campo de data</span>
        <select name="campo" defaultValue={filtro.campo} onChange={enviar}>
          {CAMPOS_DATA.map((c) => <option key={c} value={c}>{ROTULOS_CAMPO_DATA[c]}</option>)}
        </select>
      </label>
      {visao === "lista" && (
        <MultiSelect nome="g" rotulo="Status" todos="Todos" selecionados={filtro.g}
          opcoes={GRUPOS_STATUS.map((g) => ({ id: g, nome: ROTULOS_GRUPO[g] }))} />
      )}
      <label className="campo">
        <span>Completude</span>
        <select name="comp" defaultValue={filtro.comp} onChange={enviar}>
          <option value="">Todas</option>
          {COMPLETUDES.map((c) => <option key={c} value={c}>{ROTULOS_COMPLETUDE[c]}</option>)}
        </select>
      </label>
      <label className="campo">
        <span>Motivo</span>
        <select name="mot" defaultValue={filtro.mot} onChange={enviar}>
          <option value="">Todos</option>
          {MOTIVOS_PENDENCIA.map((m) => <option key={m} value={m}>{ROTULOS_MOTIVO[m]}</option>)}
        </select>
      </label>
      <MultiSelect nome="rep" rotulo="Representada" opcoes={representadas} selecionados={filtro.rep} />
      <MultiSelect nome="cli" rotulo="Cliente" opcoes={clientes} selecionados={filtro.cli} todos="Todos" />
      <label className="check"><input type="checkbox" name="lote" value="1" defaultChecked={filtro.lote} onChange={enviar} /> Aprovadas em lote</label>
      <label className="campo">
        <span>Tipo</span>
        <select name="tipo" defaultValue={filtro.tipo} onChange={enviar}>
          <option value="">Todos</option>
          <option value="normal">Normal</option>
          <option value="estorno">{visao === "analise" ? "Somente estornos" : "Estorno"}</option>
        </select>
      </label>
      <label className="check"><input type="checkbox" name="ed" value="1" defaultChecked={filtro.ed} onChange={enviar} /> Data editada manualmente</label>
      <div className="acoes-linha">
        <button className="btn-secundario btn-peq" type="submit"><Icone nome="filtro" tamanho={16} /> Aplicar</button>
        {ativos > 0 && (
          <span className="chip-filtro ativo">{ativos} {ativos === 1 ? "filtro ativo" : "filtros ativos"}
            {" · "}<Link href={visao === "lista" ? "/app/comissoes" : `/app/comissoes?visao=${visao}`}>limpar tudo</Link></span>
        )}
      </div>
    </form>
  );
}

/* ---------- Tabela com seleção, data editável e ações (Q, I, K, L, H) ---------- */

export type LinhaComissao = {
  id: string; pedido: { id: string; codigo: string } | null; cliente: string; representada: { id: string; nome: string } | null; produto: string;
  base: number; percentual: number; valor: number; previsao: string | null; recebimento: string | null; status: string; completude: string;
  motivos: string[]; origem: OrigemCalculo | null; editada: boolean; lote: string | null; historico: string[];
  /** Fase 22: tipo e devolução vinculada (estorno) */
  tipo: "normal" | "estorno"; observacao: string | null;
  devolucao: { id: string; numero: string; status: string; data: string; data_processamento: string | null; importada?: boolean; cliente_id?: string | null } | null;
};

/**
 * I.1 — seleção da aprovação em lote: vale só para o filtro atual (chave = assinatura do filtro). Sobrevive à
 * paginação e à ordenação (sessionStorage); mudar qualquer filtro troca a chave e a seleção anterior é descartada.
 */
const EVENTO_SELECAO = "comissoes-selecao";
const memoria = new Map<string, string>(); // sem storage (modo privado): só na memória da aba
function lerSelecao(chave: string): string {
  try { return sessionStorage.getItem(chave) ?? "[]"; } catch { return memoria.get(chave) ?? "[]"; }
}
function useSelecao(chave: string) {
  const bruto = useSyncExternalStore(
    (avisar) => { window.addEventListener(EVENTO_SELECAO, avisar); return () => window.removeEventListener(EVENTO_SELECAO, avisar); },
    () => lerSelecao(chave),
    () => "[]",
  );
  const sel = useMemo(() => new Set(JSON.parse(bruto) as string[]), [bruto]);
  useEffect(() => {
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k?.startsWith("comissoes-selecao:") && k !== chave) sessionStorage.removeItem(k);
      }
    } catch { /* sem storage */ }
  }, [chave]);
  const gravar = (s: Set<string>) => {
    const v = JSON.stringify([...s]);
    try { sessionStorage.setItem(chave, v); } catch { memoria.set(chave, v); }
    window.dispatchEvent(new Event(EVENTO_SELECAO));
  };
  return [sel, gravar] as const;
}

export function TabelaComissoes({ linhas, selecionaveis, assinatura, filtro, analise, total, ordens }: {
  linhas: LinhaComissao[]; selecionaveis: string[]; assinatura: string; filtro: Record<string, unknown>; analise: boolean; total: number;
  ordens: Record<"pedido" | "valor" | "previsao", { href: string; seta: string }>;
}) {
  const router = useRouter();
  const [sel, setSel] = useSelecao(`comissoes-selecao:${assinatura}`);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmacao, setConfirmacao] = useState<null | { quantidade: number; valor: number; motivos: Record<string, number>; invalidas: number }>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  const selecionaveisSet = useMemo(() => new Set(selecionaveis), [selecionaveis]);
  const selecionadas = [...sel].filter((id) => selecionaveisSet.has(id));

  async function rodar(p: Promise<{ ok?: string; erro?: string }>) {
    setOcupado(true);
    const r = await p;
    setOcupado(false);
    setMsg(r.erro ? { erro: r.erro } : { ok: r.ok });
    if (!r.erro) router.refresh();
    return !r.erro;
  }

  const alternar = (id: string) => { const s = new Set(sel); if (s.has(id)) s.delete(id); else s.add(id); setSel(s); };
  const daPagina = linhas.filter((l) => selecionaveisSet.has(l.id)).map((l) => l.id);
  const paginaToda = daPagina.length > 0 && daPagina.every((id) => sel.has(id));

  async function abrirLote() {
    if (selecionadas.length > LIMITE_LOTE) return setMsg({ erro: `Seleção acima de ${LIMITE_LOTE.toLocaleString("pt-BR")} comissões: refine o filtro.` });
    setOcupado(true);
    const r = await resumoSelecaoAction(selecionadas);
    setOcupado(false);
    if ("erro" in r && r.erro) return setMsg({ erro: r.erro });
    setConfirmacao(r as { quantidade: number; valor: number; motivos: Record<string, number>; invalidas: number });
    dialogo.current?.showModal();
  }
  async function aprovar() {
    dialogo.current?.close();
    if (await rodar(aprovarLoteAction(selecionadas, filtro))) setSel(new Set());
  }

  async function mudarData(l: LinhaComissao, valor: string) {
    if (valor && valor > hojeSP() && !window.confirm("Data futura: a comissão fica como prevista, não como recebida.\nSalvar mesmo assim?")) return router.refresh();
    await rodar(atualizarDataAction(l.id, valor || null));
  }
  async function removerData(l: LinhaComissao) {
    if (!window.confirm(`Remover a data de recebimento de ${l.pedido?.codigo ?? "esta comissão"}? Ela volta para ${l.completude === "incompleta" ? "análise (motivos preservados)" : "prevista"}.`)) return;
    await rodar(atualizarDataAction(l.id, null));
  }
  async function definir(l: LinhaComissao) {
    const v = window.prompt(`Valor da comissão de ${l.pedido?.codigo ?? ""} (R$). O valor passa a ser manual e prevalece sobre recálculos.`, l.valor > 0 ? String(l.valor).replace(".", ",") : "");
    if (v == null) return;
    await rodar(definirComissaoAction(l.id, v));
  }
  async function analisar(l: LinhaComissao) {
    if (!window.confirm(`Marcar ${l.pedido?.codigo ?? "esta comissão"} como recebida (${formatarMoeda(l.valor)})?\nDecisão sua, mesmo com dados incompletos: os motivos serão limpos e o registro guarda autor e data.`)) return;
    await rodar(marcarRecebidaAction(l.id, true));
  }

  return (
    <>
      {msg && <p className={`aviso ${msg.erro ? "aviso-erro" : "aviso-ok"}`} role="status">{msg.erro ?? msg.ok}</p>}
      {selecionaveis.length > 0 && (
        <p className="dica">
          <button type="button" className="btn-link" onClick={() => setSel(new Set(selecionaveis))}>Selecionar todos os {selecionaveis.length} do filtro atual</button>
          {" "}(recebidas, reabertas e canceladas não são selecionáveis)
        </p>
      )}
      {/* altura limitada: a barra de rolagem horizontal fica sempre visível sem rolar a página */}
      <div className="tabela-wrap tabela-rolagem">
        <table className="tabela tabela-comissoes tabela-compacta">
          <thead>
            <tr>
              <th><input type="checkbox" aria-label="Selecionar as comissões desta página" checked={paginaToda} disabled={!daPagina.length}
                onChange={() => { const s = new Set(sel); daPagina.forEach((id) => (paginaToda ? s.delete(id) : s.add(id))); setSel(s); }} /></th>
              <th><Link href={ordens.pedido.href}>Pedido{ordens.pedido.seta}</Link></th><th>Cliente</th><th>Representada</th><th>Produto</th>
              <th className="num">Valor base</th><th className="num">%</th><th className="num"><Link href={ordens.valor.href}>Comissão (R$){ordens.valor.seta}</Link></th>
              <th><Link href={ordens.previsao.href}>Previsão{ordens.previsao.seta}</Link></th><th>Recebimento</th><th>Status</th><th>Tipo</th><th>Completude</th><th>Origem</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const grupo = statusNoGrupo(l.status);
              const acoes = acoesDoStatus(l.status, l.tipo, l.devolucao);
              return (
                <tr key={l.id} className={grupo === "em_analise" ? "linha-analise" : undefined}>
                  <td>{selecionaveisSet.has(l.id) && <input type="checkbox" checked={sel.has(l.id)} onChange={() => alternar(l.id)} aria-label={`Selecionar ${l.pedido?.codigo ?? "comissão"}`} />}</td>
                  <td data-rotulo="Pedido">{l.pedido ? <Link href={`/app/pedidos/${l.pedido.id}`}>{l.pedido.codigo}</Link> : "—"}</td>
                  <td data-rotulo="Cliente" title={l.cliente}>{l.cliente}</td>
                  <td data-rotulo="Representada" title={l.representada?.nome}>{l.representada?.nome ?? "—"}</td>
                  <td data-rotulo="Produto" title={l.produto}>{l.produto}</td>
                  <td className="num" data-rotulo="Valor base">{formatarMoeda(l.base)}</td>
                  <td className="num" data-rotulo="%">{formatarPercentual(l.percentual)}</td>
                  <td className="num" data-rotulo="Comissão"><strong className={l.valor < 0 ? "valor-estorno" : undefined}>{formatarMoeda(l.valor)}</strong></td>
                  <td data-rotulo="Previsão">{l.previsao ? dia(l.previsao) : <span className="dica">Sem previsão</span>}</td>
                  <td data-rotulo="Recebimento">
                    {acoes.cancelada ? "—" : (
                      <span className="data-editavel">
                        <input type="date" defaultValue={l.recebimento ?? ""} key={`${l.id}:${l.recebimento}`} disabled={ocupado} aria-label={`Data de recebimento de ${l.pedido?.codigo ?? "comissão"}`}
                          onChange={(e) => { const v = e.target.value; if (/^[2-9]\d{3}-\d{2}-\d{2}$/.test(v)) mudarData(l, v); }} id={`data-${l.id}`} />
                        {l.editada && (
                          <details className="historico-pop">
                            <summary title="Data editada manualmente"><Icone nome="lapis" tamanho={14} /><span className="sr-only">Histórico</span></summary>
                            <div className="historico-conteudo">
                              {l.lote && <p className="dica">Aprovada em lote, com data própria (diferente da data do lote).</p>}
                              {l.historico.length ? <ul>{l.historico.map((h, i) => <li key={i}>{h}</li>)}</ul> : <p className="dica">Sem histórico.</p>}
                            </div>
                          </details>
                        )}
                      </span>
                    )}
                  </td>
                  <td data-rotulo="Status">
                    <span className={`etiqueta etiqueta-com-${grupo}`}>{rotuloStatus(l.status)}</span>
                    {l.motivos.length > 0 && <ul className="motivos">{l.motivos.map((m) => <li key={m}>{rotuloMotivo(m)}</li>)}</ul>}
                  </td>
                  <td data-rotulo="Tipo">
                    {ROTULOS_TIPO[l.tipo]}
                    {l.devolucao && <div className="dica">Devolução {l.devolucao.numero} · {l.devolucao.status === "processada" ? `processada ${dia(l.devolucao.data_processamento)}` : "pendente"}</div>}
                    {l.observacao && <div className="dica">{l.observacao}</div>}
                  </td>
                  <td data-rotulo="Completude">{l.completude === "completa" ? "Completa" : "Incompleta"}</td>
                  <td data-rotulo="Origem">{l.origem ? ROTULOS_ORIGEM[l.origem] : "—"}</td>
                  <td data-rotulo="Ações">
                    <details className="menu-linha">
                      <summary className="btn-link">Ações</summary>
                      <div className="menu-linha-itens">
                        {acoes.marcarRecebida && (
                          <button type="button" className="btn-link" disabled={ocupado} onClick={() => rodar(marcarRecebidaAction(l.id, false))}>Marcar como recebida</button>
                        )}
                        {acoes.analisar && <button type="button" className="btn-link" disabled={ocupado} onClick={() => analisar(l)}>Analisar e marcar como recebida</button>}
                        {acoes.reabrir && (
                          <button type="button" className="btn-link" disabled={ocupado} onClick={() => window.confirm("Reabrir esta comissão? Ela volta para 'Reaberta' (não é apagada).") && rodar(reabrirComissaoAction(l.id))}>Reabrir</button>
                        )}
                        {acoes.editarData && <button type="button" className="btn-link" onClick={() => document.getElementById(`data-${l.id}`)?.focus()}>Editar data</button>}
                        {acoes.editarData && l.recebimento && <button type="button" className="btn-link" disabled={ocupado} onClick={() => removerData(l)}>Remover data</button>}
                        {l.devolucao && l.devolucao.importada === false && (
                          <span className="dica">Devolução manual: informe a Data de Processamento no cadastro da devolução (Clientes › Devoluções).</span>
                        )}
                        {acoes.processar && l.devolucao && l.devolucao.importada !== false && (
                          <ProcessarDevolucoes ids={[l.devolucao.id]} rotulo="Marcar como processada" classe="btn-link" />
                        )}
                        {acoes.reabrirDevolucao && l.devolucao && l.devolucao.importada !== false && <ReabrirDevolucao id={l.devolucao.id} />}
                        {acoes.definir && (
                          <button type="button" className="btn-link" disabled={ocupado} onClick={() => definir(l)}>{l.origem === "zero" || l.valor <= 0 ? "Definir comissão" : "Editar comissão"}</button>
                        )}
                        {analise && l.motivos.includes("sem_data_faturamento") && l.pedido && <Link className="btn-link" href={`/app/pedidos/${l.pedido.id}#faturamento`}>Informar data de faturamento</Link>}
                        {analise && l.representada && (l.motivos.includes("sem_prazo_pagamento_comissao") || l.motivos.includes("sem_prazo_cliente")) && (
                          <Link className="btn-link" href={`/app/representadas/${l.representada.id}/editar`}>Configurar prazo na representada</Link>
                        )}
                        {l.historico.length > 0 && (
                          <details><summary className="btn-link">Histórico</summary><ul className="dica">{l.historico.map((h, i) => <li key={i}>{h}</li>)}</ul></details>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sel.size > 0 && (
        <div className="barra-selecao" role="region" aria-label="Seleção para aprovação em lote">
          <span><strong>{selecionadas.length}</strong> selecionada(s) de {total} no filtro</span>
          <button type="button" className="btn-link" onClick={() => setSel(new Set())}>Limpar seleção</button>
          <button type="button" className="btn" disabled={!selecionadas.length || ocupado} onClick={abrirLote}><Icone nome="check" tamanho={16} /> Aprovar em lote</button>
        </div>
      )}

      <dialog ref={dialogo} className="modal" aria-labelledby="titulo-lote">
        {confirmacao && (
          <div className="modal-corpo">
            <h2 id="titulo-lote">Aprovar {confirmacao.quantidade} comissão(ões) em lote</h2>
            <dl className="resumo">
              <div><dt>Quantidade</dt><dd>{confirmacao.quantidade}</dd></div>
              <div><dt>Valor total</dt><dd className={confirmacao.valor === 0 ? "texto-perigo forte" : undefined}>{formatarMoeda(confirmacao.valor)}</dd></div>
            </dl>
            {confirmacao.valor === 0 && (
              <p className="aviso aviso-erro">As {confirmacao.quantidade} comissões selecionadas somam R$ 0,00. Aprovar registra que não há valor a receber.</p>
            )}
            <h3>Distribuição por motivo</h3>
            {Object.keys(confirmacao.motivos).length ? (
              <ul>{Object.entries(confirmacao.motivos).map(([m, n]) => <li key={m}>{rotuloMotivo(m)}: {n}</li>)}</ul>
            ) : <p className="dica">Nenhum motivo de pendência.</p>}
            {confirmacao.invalidas > 0 && <p className="aviso aviso-erro">{confirmacao.invalidas} da seleção não são mais selecionáveis: atualize a página.</p>}
            <p className="dica">A aprovação em lote não valida os dados faltantes. Use quando a comissão zero for intencional.</p>
            <p className="dica">Cada comissão vira “Recebida” com a data de hoje; o valor e os motivos não mudam.</p>
            <div className="acoes-linha">
              <button type="button" className="btn" disabled={confirmacao.invalidas > 0} onClick={aprovar}>Confirmar aprovação</button>
              <button type="button" className="btn-link" onClick={() => dialogo.current?.close()}>Cancelar</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

/* ---------- Reabrir lote (J) ---------- */

export function BotaoReabrirLote({ lote, quantidade, valor }: { lote: string; quantidade: number; valor: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  async function reabrir() {
    if (!window.confirm(`Reabrir o lote? ${quantidade} comissão(ões) (${formatarMoeda(valor)}) voltam para análise, com os motivos preservados.`)) return;
    const e = await editadasNoLoteAction(lote);
    if ("erro" in e && e.erro) return setMsg(e.erro);
    const n = ("editadas" in e ? e.editadas : 0) ?? 0;
    if (n > 0 && !window.confirm(`Atenção: ${n} comissão(ões) deste lote têm data de recebimento editada manualmente. Ao reabrir, essas datas também são limpas. Continuar?`)) return;
    const r = await reabrirLoteAction(lote);
    setMsg("erro" in r ? r.erro : r.ok);
    router.refresh();
  }
  return (
    <>
      <button type="button" className="btn-secundario btn-peq" onClick={reabrir} disabled={quantidade === 0}>Reabrir lote</button>
      {msg && <span className="dica"> {msg}</span>}
    </>
  );
}

/* ---------- Fase 22: marcar como processada / reabrir devolução (G) ---------- */

/**
 * G.2 — confirmação obrigatória com quantidade, valor a estornar e a Data de Processamento usada; sem data na
 * devolução, a data é pedida aqui mesmo. Transacional no banco (devolução e estorno nunca divergem).
 */
export function ProcessarDevolucoes({ ids, rotulo = "Marcar como processada", classe = "btn btn-peq", aoConcluir }: {
  ids: string[]; rotulo?: string; classe?: string; aoConcluir?: () => void;
}) {
  const router = useRouter();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [resumo, setResumo] = useState<null | { quantidade: number; valor: number; semData: number; datas: string[]; invalidas: number }>(null);
  const [data, setData] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function abrir() {
    if (!ids.length) return;
    if (ids.length > LIMITE_LOTE) return setMsg({ erro: `Seleção acima de ${LIMITE_LOTE.toLocaleString("pt-BR")} devoluções: refine o filtro.` });
    setOcupado(true);
    const r = await resumoProcessamentoAction(ids);
    setOcupado(false);
    if ("erro" in r && r.erro) return setMsg({ erro: r.erro });
    const res = r as { quantidade: number; valor: number; semData: number; datas: string[]; invalidas: number };
    setResumo(res);
    setData(res.semData > 0 ? hojeSP() : "");
    dialogo.current?.showModal();
  }
  async function confirmar() {
    if (resumo && resumo.semData > 0 && !data) return;
    setOcupado(true);
    const r = await processarDevolucoesAction(ids, resumo && resumo.semData > 0 ? data : null);
    setOcupado(false);
    dialogo.current?.close();
    setMsg("erro" in r ? { erro: r.erro } : { ok: r.ok });
    if (!("erro" in r)) { aoConcluir?.(); router.refresh(); }
  }
  return (
    <>
      <button type="button" className={classe} disabled={ocupado || !ids.length} onClick={abrir}>{rotulo}</button>
      {msg && <span className={msg.erro ? "texto-perigo" : "dica"} role="status"> {msg.erro ?? msg.ok}</span>}
      <dialog ref={dialogo} className="modal" aria-labelledby="titulo-processar">
        {resumo && (
          <div className="modal-corpo">
            <h2 id="titulo-processar">Marcar {resumo.quantidade} devolução(ões) como processada(s)</h2>
            <dl className="resumo">
              <div><dt>Quantidade</dt><dd>{resumo.quantidade}</dd></div>
              <div><dt>Valor total a estornar</dt><dd className="valor-estorno">−{formatarMoeda(resumo.valor)}</dd></div>
              <div><dt>Data de Processamento</dt><dd>{resumo.semData > 0 ? "informe abaixo" : resumo.datas.map(dia).join(", ")}</dd></div>
            </dl>
            {resumo.semData > 0 && (
              <label className="campo">
                <span>Data de Processamento *</span>
                <input type="date" value={data} required onChange={(e) => setData(e.target.value)} />
                <small className="dica">{resumo.semData === resumo.quantidade ? "Nenhuma devolução selecionada tem a data." : `${resumo.semData} sem data: a data informada vale para todas as selecionadas.`}</small>
              </label>
            )}
            {resumo.invalidas > 0 && <p className="aviso aviso-erro">{resumo.invalidas} da seleção já foram processadas ou não têm estorno: atualize a página.</p>}
            <p className="dica">O estorno passa a “Recebida” na Data de Processamento e reduz o recebido daquele mês. A comissão original do pedido não muda.</p>
            <div className="acoes-linha">
              <button type="button" className="btn" disabled={ocupado || resumo.invalidas > 0 || (resumo.semData > 0 && !data)} onClick={confirmar}>Confirmar processamento</button>
              <button type="button" className="btn-link" onClick={() => dialogo.current?.close()}>Cancelar</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

/** G.5 — reabrir: devolução volta a pendente; o estorno volta a 'Prevista' (nunca é apagado). */
export function ReabrirDevolucao({ id }: { id: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  async function reabrir() {
    if (!window.confirm("Reabrir esta devolução? Ela volta para pendente e o estorno volta a “Prevista” (não é apagado).")) return;
    const limpar = window.confirm("Limpar também a Data de Processamento?\nOK = limpar · Cancelar = manter a data informada.");
    const r = await reabrirDevolucaoAction(id, limpar);
    setMsg("erro" in r ? r.erro : r.ok);
    router.refresh();
  }
  return <><button type="button" className="btn-link" onClick={reabrir}>Reabrir devolução</button>{msg && <span className="dica"> {msg}</span>}</>;
}

/** Seleção + processamento em lote na visão de devoluções (limitado ao filtro ativo, mesmo padrão da Fase 21). */
export function SelecaoDevolucoes({ pendentes, assinatura }: { pendentes: string[]; assinatura: string }) {
  const [sel, setSel] = useSelecao(`comissoes-selecao:dev:${assinatura}`);
  const validos = [...sel].filter((id) => pendentes.includes(id));
  useEffect(() => {
    const marcar = (e: Event) => {
      const alvo = e.target as HTMLInputElement;
      if (!alvo.matches?.("input[data-devolucao]")) return;
      const s = new Set(sel);
      if (alvo.checked) s.add(alvo.dataset.devolucao!); else s.delete(alvo.dataset.devolucao!);
      setSel(s);
    };
    document.addEventListener("change", marcar);
    document.querySelectorAll<HTMLInputElement>("input[data-devolucao]").forEach((i) => { i.checked = sel.has(i.dataset.devolucao!); });
    return () => document.removeEventListener("change", marcar);
  }, [sel, setSel]);
  return (
    <div className="barra-selecao">
      <button type="button" className="btn-link" disabled={!pendentes.length} onClick={() => setSel(new Set(pendentes))}>Selecionar todas as {pendentes.length} pendentes do filtro</button>
      <span><strong>{validos.length}</strong> selecionada(s)</span>
      {validos.length > 0 && <button type="button" className="btn-link" onClick={() => setSel(new Set())}>Limpar seleção</button>}
      <ProcessarDevolucoes ids={validos} rotulo="Marcar selecionadas como processadas" aoConcluir={() => setSel(new Set())} />
    </div>
  );
}
