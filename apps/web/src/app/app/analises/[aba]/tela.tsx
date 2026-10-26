"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { Abas } from "@/components/abas";
import { CardKpi } from "@/components/card-kpi";
import { Icone, type NomeIcone } from "@/components/icones";
import { MultiSelect } from "@/components/multi-select";
import { StatusPedido } from "@/components/status";
import { DIAS_RISCO, DIMENSOES, hashSpec, METRICAS, ROTULO_CANAL, TIPOS_GRAFICO } from "@/lib/analises/catalogo";
import { agrupar, histograma, somarPor } from "@/lib/analises/grafico";
import { ORDEM_PRESETS, PERIODOS_PRESET, PRESETS, specDoPreset, type PeriodoPreset, type PresetAba } from "@/lib/analises/presets";
import type { AnaliseSpec, DimensaoId, FiltrosSpec, KpiPreset, MetricaId, PresetId, ResultadoAgregado, TipoGrafico } from "@/lib/analises/tipos";
import { escreverEstado, formatarMetrica, lerEstado, quantosFiltros, variacao, type EstadoGlobal } from "@/lib/analises/url";
import { ROTULO_STATUS_PEDIDO } from "@/lib/rotulos";
import type { OpcoesFiltro } from "@/server/analises";

/** Cache no cliente por hash da spec: voltar a um filtro/ordenação já visto não refaz a consulta. */
const cache = new Map<string, ResultadoAgregado>();

const STATUS = Object.entries(ROTULO_STATUS_PEDIDO).map(([id, nome]) => ({ id, nome }));
const CANAIS = Object.entries(ROTULO_CANAL).map(([id, nome]) => ({ id, nome }));
const ICONE_KPI: Partial<Record<MetricaId, [NomeIcone, string]>> = {
  valor_liquido: ["cifrao", "tom-azul"], numero_pedidos: ["recibo", "tom-violeta"], ticket_medio: ["carrinho", "tom-ciano"],
  representadas_ativas: ["predio", "tom-ok"], clientes_ativos: ["pessoas", "tom-ok"], skus_ativos: ["pacote", "tom-rosa"],
  clientes_novos: ["mais", "tom-azul"], clientes_em_risco: ["alerta", "tom-perigo"], concentracao: ["alvo", "tom-violeta"],
  quantidade: ["pacote", "tom-ciano"], preco_medio: ["etiqueta", "tom-violeta"], itens_por_pedido: ["arquivo", "tom-ciano"],
  pedidos_cancelados: ["cancelado", "tom-neutro"],
};
/** KPIs em que subir é ruim. */
const INVERSOS = new Set<MetricaId>(["clientes_em_risco", "pedidos_cancelados", "concentracao"]);
/** KPIs cuja variação é em pontos percentuais. */
const EM_PONTOS = new Set<MetricaId>(["concentracao", "share"]);
/** Dimensão → filtro global aplicado no drill-down (clique na barra/linha). */
const FILTRO_DA_DIM: Partial<Record<DimensaoId, keyof FiltrosSpec>> = {
  representada: "representada_id", cliente: "cliente_id", produto: "produto_id", uf: "uf", canal: "canal", status: "status",
};
const CORES = ["var(--accent)", "#7C3AED", "#0891B2", "#DB2777", "#16A34A", "#D97706", "#64748B"];
const COR_ABC: Record<string, string> = { A: "var(--ok)", B: "var(--accent)", C: "#94A3B8" };
const ETIQUETA_ABC: Record<string, string> = { A: "etiqueta-confirmado", B: "etiqueta-rascunho", C: "etiqueta-cancelado" };
const EIXO = { fontSize: 12, fill: "var(--muted)" };
const DICA = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--borda-suave)", borderRadius: 10, color: "var(--text)", fontSize: 13 },
  labelStyle: { color: "var(--muted)", marginBottom: 4 },
  cursor: { fill: "var(--accent-suave)" },
};
const POR_PAGINA = 20;
const TOP_GRAFICO = 15;

type Estado = { tipo: "carregando" } | { tipo: "erro"; mensagem: string } | { tipo: "ok"; dados: ResultadoAgregado };

export function TelaAnalise({ aba, opcoes }: { aba: PresetId; opcoes: OpcoesFiltro }) {
  const preset = PRESETS[aba];
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const global = useMemo(() => lerEstado(busca), [busca]);
  const qs = escreverEstado(global);

  const inicial = specDoPreset(aba, global.periodo, global.filtros, global.granularidade);
  const [ordenacao, setOrdenacao] = useState<AnaliseSpec["tabela"]["ordenacao"]>(inicial.tabela.ordenacao);
  const [tipoGrafico, setTipoGrafico] = useState<TipoGrafico>(preset.graficoTipo);
  const [compacta, setCompacta] = useState(!!preset.compacta);
  const [pagina, setPagina] = useState(0);
  const [texto, setTexto] = useState("");
  const [soRisco, setSoRisco] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  const spec = useMemo<AnaliseSpec>(() => {
    const s = specDoPreset(aba, global.periodo, global.filtros, global.granularidade);
    return { ...s, grafico: { ...s.grafico, tipo: tipoGrafico }, tabela: { ...s.tabela, ordenacao } };
  }, [aba, global, tipoGrafico, ordenacao]);
  // o tipo de gráfico não muda a consulta: fica fora da chave do cache
  const chave = hashSpec({ ...spec, grafico: { ...spec.grafico, tipo: preset.graficoTipo } });

  // resposta da última consulta disparada; o estado exibido deriva do cache + chave atual
  const [resposta, setResposta] = useState<{ chave: string; estado: Estado } | null>(null);
  const emCache = cache.get(chave);
  const estado: Estado = emCache ? { tipo: "ok", dados: emCache } : resposta?.chave === chave ? resposta.estado : { tipo: "carregando" };
  useEffect(() => {
    if (preset.fase > 2 || cache.has(chave)) return;
    const ctrl = new AbortController();
    const setEstado = (e: Estado) => setResposta({ chave, estado: e });
    fetch("/api/analises", { method: "POST", headers: { "content-type": "application/json" }, body: chave, signal: ctrl.signal })
      .then(async (r) => {
        const corpo = await r.json().catch(() => null);
        if (!r.ok) throw new Error(corpo?.erro ?? "Não foi possível carregar a análise.");
        cache.set(chave, corpo as ResultadoAgregado);
        setEstado({ tipo: "ok", dados: corpo as ResultadoAgregado });
      })
      .catch((e: unknown) => { if (!ctrl.signal.aborted) setEstado({ tipo: "erro", mensagem: e instanceof Error ? e.message : "Erro inesperado." }); });
    return () => ctrl.abort();
  }, [chave, preset.fase, tentativa]);

  function aplicar(novo: Partial<EstadoGlobal>) {
    const q = escreverEstado({ ...global, ...novo });
    setPagina(0);
    router.replace(q ? `${caminho}?${q}` : caminho, { scroll: false });
  }
  const filtrar = (campo: keyof FiltrosSpec, ids: string[]) => aplicar({ filtros: { ...global.filtros, [campo]: ids } });
  const drill = (d: DimensaoId, id: string) => { const f = FILTRO_DA_DIM[d]; if (f && id) filtrar(f, [id]); };

  const dados = estado.tipo === "ok" ? estado.dados : null;
  const dimensao = spec.dimensoes[0]!;
  const metricaGrafico: MetricaId = aba === "pedido" ? "valor_liquido" : spec.metricas[0]!;

  // busca e "só em risco" (Por Cliente) filtram as linhas já carregadas; totais seguem os da consulta
  const linhasVisiveis = useMemo(() => {
    if (!dados) return [];
    const t = texto.trim().toLocaleLowerCase("pt-BR");
    return dados.linhas.filter((l) =>
      (!t || String(l[dimensao] ?? "").toLocaleLowerCase("pt-BR").includes(t)) &&
      (!soRisco || Number(l.dias_sem_comprar ?? 0) > DIAS_RISCO));
  }, [dados, texto, soRisco, dimensao]);
  const linhasPagina = linhasVisiveis.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  const paginas = Math.max(1, Math.ceil(linhasVisiveis.length / POR_PAGINA));
  const maxMicro = preset.microbarra && dados ? Math.max(1, ...dados.linhas.map((l) => Number(l[preset.microbarra!] ?? 0))) : 1;

  async function exportar(formato: "csv" | "xlsx") {
    if (!dados) return;
    const cab = preset.colunas.map((c) => rotuloColuna(preset, c));
    const linhas = [...dados.linhas.map((l) => preset.colunas.map((c) => valorExportado(c, l[c]))),
      preset.colunas.map((c, i) => (i === 0 ? "Total" : ehDimensao(c) ? "" : valorExportado(c, dados.totais[c])))];
    const nome = `analise-${aba}-${spec.periodo.de}_${spec.periodo.ate}`;
    if (formato === "xlsx") {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cab, ...linhas]), "Análise");
      XLSX.writeFile(wb, `${nome}.xlsx`);
      return;
    }
    const cel = (v: unknown) => { const s = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = "﻿" + [cab, ...linhas].map((l) => l.map(cel).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${nome}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const chips = filtrosAtivos(global.filtros, opcoes);
  const granFixa = preset.granularidade;

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <p className="trilha"><Link href={`/app/analises/representada${qs ? `?${qs}` : ""}`}>Análises</Link> / {preset.titulo}</p>
          <h1 className="titulo-icone"><Icone nome="grafico" tamanho={24} /> {preset.titulo}</h1>
          <p className="subtitulo">{PERIODOS_PRESET[global.preset]} · {dataBR(spec.periodo.de)} a {dataBR(spec.periodo.ate)}</p>
        </div>
        <div className="acoes-linha">
          <details className="menu-exportar">
            <summary className={`btn-secundario btn-peq${dados ? "" : " desabilitado"}`} aria-disabled={!dados}><Icone nome="download" tamanho={16} /> Exportar</summary>
            {dados && (
              <div className="menu-exportar-opcoes">
                <button type="button" className="btn-link" onClick={() => exportar("csv")}>CSV</button>
                <button type="button" className="btn-link" onClick={() => exportar("xlsx")}>Excel (.xlsx)</button>
              </div>
            )}
          </details>
          <button type="button" className="btn-secundario btn-peq" disabled title="Disponível em breve">Salvar visão</button>
          <button type="button" className="btn btn-peq" disabled title="Disponível em breve">Personalizar</button>
        </div>
      </div>

      <Abas base="/app/analises" busca={qs} abas={ORDEM_PRESETS.map((id) => ({ href: id, rotulo: PRESETS[id].titulo.replace("Por ", "") }))} />

      <div className="card filtros-custos filtros-analise">
        <label className="campo">
          <span>Período</span>
          <select value={global.preset} onChange={(e) => {
            const p = e.target.value as PeriodoPreset;
            aplicar(p === "personalizado" ? { preset: p, periodo: global.periodo } : { ...lerEstado(new URLSearchParams({ p })), filtros: global.filtros, granularidade: global.granularidade });
          }}>
            {Object.entries(PERIODOS_PRESET).map(([id, r]) => <option key={id} value={id}>{r}</option>)}
          </select>
        </label>
        {global.preset === "personalizado" && (
          <>
            <label className="campo"><span>De</span><input type="date" value={spec.periodo.de} max={spec.periodo.ate}
              onChange={(e) => e.target.value && aplicar({ periodo: { ...global.periodo, de: e.target.value } })} /></label>
            <label className="campo"><span>Até</span><input type="date" value={spec.periodo.ate} min={spec.periodo.de}
              onChange={(e) => e.target.value && aplicar({ periodo: { ...global.periodo, ate: e.target.value } })} /></label>
          </>
        )}
        <MultiSelect rotulo="Representada" opcoes={opcoes.representadas} selecionados={global.filtros.representada_id} aoMudar={(ids) => filtrar("representada_id", ids)} />
        <MultiSelect rotulo="Cliente" opcoes={opcoes.clientes} selecionados={global.filtros.cliente_id} aoMudar={(ids) => filtrar("cliente_id", ids)} todos="Todos" />
        <MultiSelect rotulo="Produto" opcoes={opcoes.produtos} selecionados={global.filtros.produto_id} aoMudar={(ids) => filtrar("produto_id", ids)} todos="Todos" />
        <MultiSelect rotulo="Status" opcoes={STATUS} selecionados={global.filtros.status} aoMudar={(ids) => filtrar("status", ids)} todos="Confirmados e entregues" />
        <MultiSelect rotulo="UF" opcoes={opcoes.ufs.map((u) => ({ id: u, nome: u }))} selecionados={global.filtros.uf} aoMudar={(ids) => filtrar("uf", ids)} />
        <MultiSelect rotulo="Canal" opcoes={CANAIS} selecionados={global.filtros.canal} aoMudar={(ids) => filtrar("canal", ids)} todos="Todos" />
        <div className="campo">
          <span>Granularidade</span>
          <div className="alternador" role="group" aria-label="Granularidade"
            title={granFixa ? `Esta aba opera por ${granFixa === "pedidos" ? "pedido" : "item do pedido"}` : undefined}>
            {(["itens", "pedidos"] as const).map((g) => {
              const ativa = spec.granularidade === g;
              return (
                <button key={g} type="button" className={ativa ? "chip-filtro ativo" : "chip-filtro"} aria-pressed={ativa} disabled={!!granFixa && !ativa}
                  onClick={() => aplicar({ granularidade: g })}>{g === "itens" ? "Itens do pedido" : "Pedidos"}</button>
              );
            })}
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="chips-ativos" aria-label="Filtros ativos">
          <span className="dica">{quantosFiltros(global.filtros)} filtro(s) reduzindo a base:</span>
          {chips.map((c) => (
            <button key={`${c.campo}-${c.id}`} type="button" className="chip-filtro ativo" title="Remover filtro"
              onClick={() => filtrar(c.campo, global.filtros[c.campo].filter((x) => x !== c.id))}>{c.rotulo} ×</button>
          ))}
          <button type="button" className="btn-link" onClick={() => aplicar({ filtros: { representada_id: [], cliente_id: [], produto_id: [], status: [], uf: [], canal: [] } })}>Limpar tudo</button>
        </div>
      )}

      {preset.fase > 2 ? (
        <div className="card vazio"><p><strong>{preset.titulo}</strong> chega na próxima etapa do módulo Análises.</p></div>
      ) : estado.tipo === "erro" ? (
        <div className="aviso aviso-erro" role="alert">
          {estado.mensagem} <button type="button" className="btn-link" onClick={() => { setResposta(null); setTentativa((t) => t + 1); }}>Tentar de novo</button>
        </div>
      ) : (
        <>
          <section className="dash-kpis analise-kpis" aria-busy={!dados} aria-label="Indicadores">
            {dados
              ? preset.kpis.map((k) => <Kpi key={typeof k === "string" ? k : k.indisponivel} kpi={k} totais={dados.totais} />)
              : preset.kpis.map((_, i) => <div key={i} className="dash-card esqueleto esqueleto-kpi" />)}
          </section>

          {dados && dados.linhas.length === 0 ? (
            <div className="card vazio">
              <p><strong>Nenhum pedido no período e filtros escolhidos.</strong></p>
              <p className="dica">Por padrão entram só pedidos confirmados e entregues. Experimente:</p>
              <div className="acoes-linha">
                <button type="button" className="btn-suave btn-peq" onClick={() => aplicar({ ...lerEstado(new URLSearchParams({ p: "ano" })), filtros: global.filtros })}>Este ano</button>
                <button type="button" className="btn-suave btn-peq" onClick={() => aplicar({ ...lerEstado(new URLSearchParams({ p: "ano_anterior" })), filtros: global.filtros })}>Ano anterior</button>
                {chips.length > 0 && <button type="button" className="btn-suave btn-peq" onClick={() => aplicar({ filtros: { representada_id: [], cliente_id: [], produto_id: [], status: [], uf: [], canal: [] } })}>Remover filtros</button>}
              </div>
            </div>
          ) : (
            <>
              <div className="dash-card">
                <div className="analise-card-topo">
                  <div>
                    <h2 className="titulo-icone"><Icone nome="grafico" tamanho={20} /> {tituloGrafico(tipoGrafico, spec, metricaGrafico)}</h2>
                    <p className="dica">{subtituloGrafico(tipoGrafico, spec, dados)}</p>
                  </div>
                  {preset.graficos.length > 1 && (
                    <label className="campo campo-inline">
                      <span className="sr-only">Tipo de gráfico</span>
                      <select value={tipoGrafico} onChange={(e) => setTipoGrafico(e.target.value as TipoGrafico)}>
                        {preset.graficos.map((t) => <option key={t} value={t}>{TIPOS_GRAFICO[t]}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                {dados ? (
                  <GraficoAnalise tipo={tipoGrafico} spec={spec} metrica={metricaGrafico} linhas={dados.linhas} aoClicar={drill} />
                ) : <div className="esqueleto esqueleto-grafico" />}
                <p className="analise-total">
                  Total do período: <strong>{dados ? formatarMetrica(metricaGrafico, dados.totais[metricaGrafico]) : "…"}</strong>
                  {dados && aba === "pedido" && <> · {formatarMetrica("numero_pedidos", dados.totais.numero_pedidos)} pedidos</>}
                </p>
              </div>

              <div className="dash-card">
                <div className="analise-card-topo">
                  <h2 className="titulo-icone"><Icone nome="arquivo" tamanho={20} /> Detalhamento</h2>
                  <div className="acoes-linha">
                    {preset.busca && (
                      <>
                        <input type="search" className="busca-analise" placeholder="Buscar cliente…" aria-label="Buscar cliente" value={texto}
                          onChange={(e) => { setTexto(e.target.value); setPagina(0); }} />
                        <button type="button" className={soRisco ? "chip-filtro ativo" : "chip-filtro"} aria-pressed={soRisco}
                          onClick={() => { setSoRisco((v) => !v); setPagina(0); }}>Só em risco ({DIAS_RISCO}+ dias)</button>
                      </>
                    )}
                    <button type="button" className="btn-suave btn-peq" onClick={() => setCompacta((c) => !c)} aria-pressed={compacta}>
                      {compacta ? "Densidade: compacta" : "Densidade: confortável"}
                    </button>
                  </div>
                </div>
                {!dados ? <div className="esqueleto esqueleto-lista" /> : (
                  <>
                    {dados.totalLinhas > dados.linhas.length && (
                      <p className="dica">Mostrando {dados.linhas.length} de {dados.totalLinhas} linhas (ordenadas pela coluna escolhida). Os totais consideram todas.</p>
                    )}
                    <div className="tabela-wrap">
                      <table className={compacta ? "tabela tabela-compacta" : "tabela"}>
                        <thead>
                          <tr>
                            {preset.colunas.map((c) => {
                              const ativa = ordenacao.campo === c;
                              return (
                                <th key={c} className={ehDimensao(c) || c === "classe_abc" ? undefined : "num"} aria-sort={ativa ? (ordenacao.direcao === "asc" ? "ascending" : "descending") : "none"}>
                                  <button type="button" className="th-ordenar" onClick={() => { setPagina(0); setOrdenacao({ campo: c, direcao: ativa && ordenacao.direcao === "desc" ? "asc" : "desc" }); }}>
                                    {rotuloColuna(preset, c)} {ativa ? (ordenacao.direcao === "desc" ? "↓" : "↑") : ""}
                                  </button>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {linhasPagina.length === 0 && (
                            <tr><td colSpan={preset.colunas.length} className="dica">Nenhuma linha com essa busca.</td></tr>
                          )}
                          {linhasPagina.map((l, i) => (
                            <tr key={spec.dimensoes.map((d) => String(l[`${d}__id`] ?? "")).join("|") || i}>
                              {preset.colunas.map((c) => <Celula key={c} coluna={c} linha={l} preset={preset} maxMicro={maxMicro} aoFiltrar={drill} />)}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            {preset.colunas.map((c, i) => (
                              <th key={c} className={ehDimensao(c) || c === "classe_abc" ? undefined : "num"}>
                                {i === 0 ? "Total" : ehDimensao(c) ? "" : formatarMetrica(c as MetricaId, dados.totais[c])}
                              </th>
                            ))}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {paginas > 1 && (
                      <div className="paginacao">
                        <button type="button" className="btn-suave btn-peq" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
                        <span className="dica">Página {pagina + 1} de {paginas}</span>
                        <button type="button" className="btn-suave btn-peq" disabled={pagina >= paginas - 1} onClick={() => setPagina((p) => p + 1)}>Próxima</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function Kpi({ kpi, totais }: { kpi: KpiPreset; totais: ResultadoAgregado["totais"] }) {
  if (typeof kpi !== "string") return <CardKpi titulo={kpi.indisponivel} valor="—" variacao={null} icone="alerta" tom="tom-neutro" nota={kpi.motivo} />;
  const [icone, tom] = ICONE_KPI[kpi] ?? ["grafico", "tom-azul"];
  const atual = totais[kpi];
  const anterior = totais[`${kpi}__ant`];
  const pontos = EM_PONTOS.has(kpi);
  const v = pontos ? (atual == null || anterior == null ? null : Math.round((Number(atual) - Number(anterior)) * 10) / 10) : variacao(atual, anterior);
  return <CardKpi titulo={METRICAS[kpi].rotulo} valor={formatarMetrica(kpi, atual)} icone={icone} tom={tom} variacao={v} pontos={pontos} inverso={INVERSOS.has(kpi)} />;
}

function Celula({ coluna: c, linha: l, preset, maxMicro, aoFiltrar }: {
  coluna: string; linha: ResultadoAgregado["linhas"][number]; preset: PresetAba; maxMicro: number; aoFiltrar: (d: DimensaoId, id: string) => void;
}) {
  if (ehDimensao(c)) {
    const id = String(l[`${c}__id`] ?? "");
    if (c === "pedido") return <td><Link href={`/app/pedidos/${id}`}>{String(l[c] ?? "—")}</Link></td>;
    if (c === "status") return <td><StatusPedido status={String(l[c] ?? "")} /></td>;
    if (FILTRO_DA_DIM[c] && id) {
      return <td><button type="button" className="btn-link texto-esquerda" title={`Filtrar por ${DIMENSOES[c].rotulo.toLowerCase()}`} onClick={() => aoFiltrar(c, id)}>{rotuloDim(c, l[c])}</button></td>;
    }
    return <td>{rotuloDim(c, l[c])}</td>;
  }
  const m = c as MetricaId;
  if (m === "classe_abc") return <td><span className={`etiqueta ${ETIQUETA_ABC[String(l[m])] ?? ""}`}>{String(l[m] ?? "—")}</span></td>;
  if (m === "dias_sem_comprar") {
    const risco = Number(l[m] ?? 0) > DIAS_RISCO;
    return <td className={`num${risco ? " texto-perigo forte" : ""}`} title={risco ? "Cliente em risco" : undefined}>{risco && "⚠ "}{formatarMetrica(m, l[m])}</td>;
  }
  if (m === preset.microbarra) {
    const p = Math.round((Number(l[m] ?? 0) / maxMicro) * 100);
    return <td className="num"><span className="micro-barra"><span style={{ width: `${p}%` }} /></span>{formatarMetrica(m, l[m])}</td>;
  }
  return <td className={`num${m === "variacao_percentual" ? classeVariacao(l[m]) : ""}`}>{formatarMetrica(m, l[m])}</td>;
}

function GraficoAnalise({ tipo, spec, metrica, linhas, aoClicar }: {
  tipo: TipoGrafico; spec: AnaliseSpec; metrica: MetricaId; linhas: ResultadoAgregado["linhas"]; aoClicar: (d: DimensaoId, id: string) => void;
}) {
  const dim = spec.grafico.dimensaoLinha;
  const fmt = (v: unknown) => formatarMetrica(metrica, Number(v));
  const curto = (v: number) => (METRICAS[metrica].unidade === "brl" ? new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v) : String(v));
  const ALTURA = 340;

  if (tipo === "dispersao") {
    const pontos = linhas.map((l) => ({ id: String(l[`${dim}__id`] ?? ""), nome: String(l[dim] ?? "—"), dias: Number(l.dias_sem_comprar ?? 0), valor: Number(l[metrica] ?? 0), classe: String(l.classe_abc ?? "C") }));
    return (
      <div className="dash-grafico" role="img" aria-label={`Valor × dias sem comprar por cliente: ${pontos.length} clientes`}>
        <ResponsiveContainer width="100%" height={ALTURA}>
          <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="var(--borda-suave)" />
            <XAxis type="number" dataKey="dias" name="Dias sem comprar" unit=" d" tick={EIXO} axisLine={false} tickLine={false} />
            <YAxis type="number" dataKey="valor" name={METRICAS[metrica].rotulo} tickFormatter={curto} tick={EIXO} axisLine={false} tickLine={false} width={64} />
            <ZAxis range={[60, 60]} />
            <Tooltip {...DICA} cursor={{ strokeDasharray: "3 3" }}
              content={({ payload }) => {
                const p = payload?.[0]?.payload as (typeof pontos)[number] | undefined;
                return p ? <div className="dica-grafico"><strong>{p.nome}</strong><br />Classe {p.classe} · {fmt(p.valor)}<br />{p.dias} dias sem comprar</div> : null;
              }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
            {(["A", "B", "C"] as const).map((c) => {
              const serie = pontos.filter((p) => p.classe === c);
              return (
                <Scatter key={c} name={`Classe ${c}`} data={serie} fill={COR_ABC[c]} cursor="pointer"
                  onClick={(_, i) => { const id = serie[i]?.id; if (id) aoClicar(dim, id); }} />
              );
            })}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (tipo === "histograma") {
    const faixas = histograma(linhas, metrica);
    return (
      <div className="dash-grafico" role="img" aria-label={`Pedidos por faixa de ticket: ${faixas.map((f) => `${f.nome} ${f.pedidos}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height={ALTURA}>
          <BarChart data={faixas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--borda-suave)" />
            <XAxis dataKey="nome" tick={EIXO} axisLine={false} tickLine={false} interval={0} />
            <YAxis allowDecimals={false} tick={EIXO} axisLine={false} tickLine={false} width={40} />
            <Tooltip {...DICA} formatter={(v, _n, item) => [`${v} pedido(s) · ${fmt((item?.payload as { valor: number }).valor)}`, "Faixa de ticket (R$)"]} />
            <Bar dataKey="pedidos" fill="var(--accent)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (tipo === "coluna_agrupada" && spec.grafico.dimensaoSerie) {
    const { series, dados } = agrupar(linhas, dim, spec.grafico.dimensaoSerie, metrica);
    return (
      <div className="dash-grafico" role="img" aria-label={`${METRICAS[metrica].rotulo} por ${DIMENSOES[dim].rotulo} e ${DIMENSOES[spec.grafico.dimensaoSerie].rotulo}`}>
        <ResponsiveContainer width="100%" height={ALTURA}>
          <BarChart data={dados.slice(0, TOP_GRAFICO)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--borda-suave)" />
            <XAxis dataKey="nome" tick={EIXO} axisLine={false} tickLine={false} interval={0} />
            <YAxis tickFormatter={curto} tick={EIXO} axisLine={false} tickLine={false} width={64} />
            <Tooltip {...DICA} formatter={(v, n) => [fmt(v), String(n)]} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
            {series.slice(0, CORES.length).map((s, i) => <Bar key={s} dataKey={s} name={s} fill={CORES[i]} radius={[4, 4, 0, 0]} maxBarSize={36} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // barras / colunas / rosca sobre a dimensão principal do gráfico (top N; o total vem de `totais`)
  const dimSimples = tipo === "coluna_agrupada" ? dim : spec.dimensoes[0]!;
  const dados = somarPor(linhas, dimSimples, metrica).slice(0, TOP_GRAFICO).map((p) => ({ ...p, nome: rotuloDim(dimSimples, p.nome) }));
  const clique = FILTRO_DA_DIM[dimSimples] ? (_: unknown, i: number) => { const id = dados[i]?.id; if (id) aoClicar(dimSimples, id); } : undefined;
  const rotulo = `${METRICAS[metrica].rotulo} por ${DIMENSOES[dimSimples].rotulo}: ${dados.map((d) => `${d.nome} ${fmt(d.valor)}`).join(", ")}`;
  const altura = tipo === "barra_horizontal" ? Math.max(260, dados.length * 36 + 40) : ALTURA;
  return (
    <div className="dash-grafico" role="img" aria-label={rotulo}>
      <ResponsiveContainer width="100%" height={altura}>
        {tipo === "donut" ? (
          <PieChart>
            <Tooltip {...DICA} formatter={(v, n) => [fmt(v), String(n)]} />
            <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius="55%" outerRadius="85%" paddingAngle={1} onClick={clique} cursor={clique ? "pointer" : undefined}>
              {dados.map((d, i) => <Cell key={d.id} fill={CORES[i % CORES.length]} />)}
            </Pie>
          </PieChart>
        ) : tipo === "barra_horizontal" ? (
          <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--borda-suave)" />
            <XAxis type="number" tickFormatter={curto} tick={EIXO} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="nome" tick={EIXO} axisLine={false} tickLine={false} width={140} />
            <Tooltip {...DICA} formatter={(v) => [fmt(v), METRICAS[metrica].rotulo]} />
            <Bar dataKey="valor" fill="var(--accent)" radius={[0, 6, 6, 0]} maxBarSize={28} onClick={clique} cursor={clique ? "pointer" : undefined} />
          </BarChart>
        ) : (
          <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--borda-suave)" />
            <XAxis dataKey="nome" tick={EIXO} axisLine={false} tickLine={false} interval={0} />
            <YAxis tickFormatter={curto} tick={EIXO} axisLine={false} tickLine={false} width={64} />
            <Tooltip {...DICA} formatter={(v) => [fmt(v), METRICAS[metrica].rotulo]} />
            <Bar dataKey="valor" fill="var(--accent)" radius={[6, 6, 0, 0]} maxBarSize={44} onClick={clique} cursor={clique ? "pointer" : undefined} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function tituloGrafico(tipo: TipoGrafico, spec: AnaliseSpec, metrica: MetricaId) {
  if (tipo === "dispersao") return `${METRICAS[metrica].rotulo} × dias sem comprar`;
  if (tipo === "histograma") return "Pedidos por faixa de ticket";
  const dim = tipo === "coluna_agrupada" ? spec.grafico.dimensaoLinha : spec.dimensoes[0]!;
  return `${METRICAS[metrica].rotulo} por ${DIMENSOES[dim].rotulo.toLowerCase()}`;
}

function subtituloGrafico(tipo: TipoGrafico, spec: AnaliseSpec, dados: ResultadoAgregado | null) {
  if (!dados) return "…";
  const n = dados.linhas.length;
  if (tipo === "dispersao") return `${n} cliente(s) · cor pela classe ABC (A até 80% do valor, B até 95%) · clique para filtrar`;
  if (tipo === "histograma") return `${n} pedido(s) distribuídos por valor`;
  if (tipo === "coluna_agrupada" && spec.grafico.dimensaoSerie) return `Série por ${DIMENSOES[spec.grafico.dimensaoSerie].rotulo.toLowerCase()} · top ${TOP_GRAFICO}`;
  const d = DIMENSOES[spec.dimensoes[0]!].rotulo.toLowerCase();
  return `${n > TOP_GRAFICO ? `Top ${TOP_GRAFICO} de ${dados.totalLinhas}` : `${n} ${d}(s)`} · clique para filtrar`;
}

const ehDimensao = (c: string): c is DimensaoId => c in DIMENSOES;
const rotuloColuna = (p: PresetAba, c: string) => p.rotulos?.[c] ?? (ehDimensao(c) ? DIMENSOES[c].rotulo : METRICAS[c as MetricaId]?.rotulo ?? c);
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const classeVariacao = (v: unknown) => (v == null ? "" : Number(v) > 0 ? " texto-ok" : Number(v) < 0 ? " texto-perigo" : "");

/** Valor da célula na exportação: números crus (planilha), datas em dd/mm/aaaa, rótulos traduzidos. */
function valorExportado(c: string, v: unknown): string | number | null {
  if (v == null || v === "") return null;
  if (ehDimensao(c)) return rotuloDim(c, v);
  const u = METRICAS[c as MetricaId]?.unidade;
  if (u === "texto") return String(v);
  if (u === "data") return formatarMetrica(c as MetricaId, String(v));
  return Number(v);
}

function rotuloDim(d: DimensaoId, v: unknown): string {
  const s = v == null ? "—" : String(v);
  if (d === "canal") return ROTULO_CANAL[s] ?? s;
  if (d === "status") return ROTULO_STATUS_PEDIDO[s] ?? s;
  if (d === "dia" && /^\d{4}-\d{2}-\d{2}$/.test(s)) return dataBR(s);
  return s;
}

function filtrosAtivos(f: FiltrosSpec, o: OpcoesFiltro): { campo: keyof FiltrosSpec; id: string; rotulo: string }[] {
  const nome = (lista: { id: string; nome: string }[], id: string) => lista.find((x) => x.id === id)?.nome ?? "?";
  return [
    ...f.representada_id.map((id) => ({ campo: "representada_id" as const, id, rotulo: nome(o.representadas, id) })),
    ...f.cliente_id.map((id) => ({ campo: "cliente_id" as const, id, rotulo: nome(o.clientes, id) })),
    ...f.produto_id.map((id) => ({ campo: "produto_id" as const, id, rotulo: nome(o.produtos, id) })),
    ...f.status.map((id) => ({ campo: "status" as const, id, rotulo: nome(STATUS, id) })),
    ...f.uf.map((id) => ({ campo: "uf" as const, id, rotulo: id })),
    ...f.canal.map((id) => ({ campo: "canal" as const, id, rotulo: ROTULO_CANAL[id] ?? id })),
  ];
}
