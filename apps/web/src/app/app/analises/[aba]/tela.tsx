"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Abas } from "@/components/abas";
import { CardKpi } from "@/components/card-kpi";
import { Icone, type NomeIcone } from "@/components/icones";
import { MultiSelect } from "@/components/multi-select";
import { DIMENSOES, hashSpec, METRICAS, ROTULO_CANAL, TIPOS_GRAFICO } from "@/lib/analises/catalogo";
import { ORDEM_PRESETS, PERIODOS_PRESET, PRESETS, specDoPreset, type PeriodoPreset } from "@/lib/analises/presets";
import type { AnaliseSpec, DimensaoId, FiltrosSpec, MetricaId, PresetId, ResultadoAgregado, TipoGrafico } from "@/lib/analises/tipos";
import { escreverEstado, formatarMetrica, lerEstado, quantosFiltros, variacao, type EstadoGlobal } from "@/lib/analises/url";
import type { OpcoesFiltro } from "@/server/analises";

/** Cache no cliente por hash da spec: voltar a um filtro/ordenação já visto não refaz a consulta. */
const cache = new Map<string, ResultadoAgregado>();

const STATUS = [{ id: "confirmado", nome: "Confirmado" }, { id: "entregue", nome: "Entregue" }, { id: "rascunho", nome: "Rascunho" }, { id: "cancelado", nome: "Cancelado" }];
const CANAIS = Object.entries(ROTULO_CANAL).map(([id, nome]) => ({ id, nome }));
const ICONE_KPI: Partial<Record<MetricaId, [NomeIcone, string]>> = {
  valor_liquido: ["cifrao", "tom-azul"], numero_pedidos: ["recibo", "tom-violeta"], ticket_medio: ["carrinho", "tom-ciano"],
  representadas_ativas: ["predio", "tom-ok"], clientes_ativos: ["pessoas", "tom-ok"], skus_ativos: ["pacote", "tom-rosa"],
};
const GRAFICOS_1D: TipoGrafico[] = ["barra_horizontal", "coluna", "donut"];
const CORES = ["var(--accent)", "#7C3AED", "#0891B2", "#DB2777", "#16A34A", "#D97706", "#64748B"];
const EIXO = { fontSize: 12, fill: "var(--muted)" };
const DICA = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--borda-suave)", borderRadius: 10, color: "var(--text)", fontSize: 13 },
  labelStyle: { color: "var(--muted)", marginBottom: 4 },
  cursor: { fill: "var(--accent-suave)" },
};
const POR_PAGINA = 10;

type Estado = { tipo: "carregando" } | { tipo: "erro"; mensagem: string } | { tipo: "ok"; dados: ResultadoAgregado };

export function TelaAnalise({ aba, opcoes }: { aba: PresetId; opcoes: OpcoesFiltro }) {
  const preset = PRESETS[aba];
  const router = useRouter();
  const caminho = usePathname();
  const busca = useSearchParams();
  const global = useMemo(() => lerEstado(busca), [busca]);
  const qs = escreverEstado(global);

  const [ordenacao, setOrdenacao] = useState<AnaliseSpec["tabela"]["ordenacao"]>({ campo: preset.metricasPadrao[0]!, direcao: "desc" });
  const [tipoGrafico, setTipoGrafico] = useState<TipoGrafico>(preset.graficoTipo);
  const [compacta, setCompacta] = useState(false);
  const [pagina, setPagina] = useState(0);
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
    if (preset.fase > 1 || cache.has(chave)) return;
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

  const dados = estado.tipo === "ok" ? estado.dados : null;
  const dimensao = spec.dimensoes[0]!;
  const metricaGrafico = spec.metricas[0]!;

  async function exportar(formato: "csv" | "xlsx") {
    if (!dados) return;
    const cab = preset.colunas.map(rotuloColuna);
    const linhas = [...dados.linhas.map((l) => preset.colunas.map((c) => (ehDimensao(c) ? String(l[c] ?? "") : numero(l[c])))),
      preset.colunas.map((c, i) => (i === 0 ? "Total" : ehDimensao(c) ? "" : numero(dados.totais[c])))];
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
  const linhasPagina = dados ? dados.linhas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA) : [];
  const paginas = dados ? Math.max(1, Math.ceil(dados.linhas.length / POR_PAGINA)) : 1;

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
          <button type="button" className="btn-secundario btn-peq" disabled title="Disponível em breve">Personalizar</button>
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
          <div className="alternador" role="group" aria-label="Granularidade">
            {(["itens", "pedidos"] as const).map((g) => (
              <button key={g} type="button" className={global.granularidade === g ? "chip-filtro ativo" : "chip-filtro"} aria-pressed={global.granularidade === g}
                onClick={() => aplicar({ granularidade: g })}>{g === "itens" ? "Itens" : "Pedidos"}</button>
            ))}
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="chips-ativos" aria-label="Filtros ativos">
          <span className="dica">{quantosFiltros(global.filtros)} filtro(s):</span>
          {chips.map((c) => (
            <button key={`${c.campo}-${c.id}`} type="button" className="chip-filtro ativo" title="Remover filtro"
              onClick={() => filtrar(c.campo, global.filtros[c.campo].filter((x) => x !== c.id))}>{c.rotulo} ×</button>
          ))}
          <button type="button" className="btn-link" onClick={() => aplicar({ filtros: { representada_id: [], cliente_id: [], produto_id: [], status: [], uf: [], canal: [] } })}>Limpar tudo</button>
        </div>
      )}

      {preset.fase > 1 ? (
        <div className="card vazio"><p><strong>{preset.titulo}</strong> chega na próxima etapa do módulo Análises.</p></div>
      ) : estado.tipo === "erro" ? (
        <div className="aviso aviso-erro" role="alert">
          {estado.mensagem} <button type="button" className="btn-link" onClick={() => { setResposta(null); setTentativa((t) => t + 1); }}>Tentar de novo</button>
        </div>
      ) : (
        <>
          <section className="dash-kpis analise-kpis" aria-busy={!dados} aria-label="Indicadores">
            {dados
              ? preset.kpis.map((m) => {
                  const [icone, tom] = ICONE_KPI[m] ?? ["grafico", "tom-azul"];
                  return <CardKpi key={m} titulo={METRICAS[m].rotulo} valor={formatarMetrica(m, dados.totais[m])} icone={icone} tom={tom}
                    variacao={variacao(dados.totais[m], dados.totais[`${m}__ant`])} />;
                })
              : preset.kpis.map((m) => <div key={m} className="dash-card esqueleto esqueleto-kpi" />)}
          </section>

          {dados && dados.linhas.length === 0 ? (
            <div className="card vazio">
              <p><strong>Nenhum pedido no período e filtros escolhidos.</strong></p>
              <p className="dica">Amplie o período ou remova filtros. Por padrão entram só pedidos confirmados e entregues.</p>
            </div>
          ) : (
            <>
              <div className="dash-card">
                <div className="analise-card-topo">
                  <div>
                    <h2 className="titulo-icone"><Icone nome="grafico" tamanho={20} /> {METRICAS[metricaGrafico].rotulo} por {DIMENSOES[dimensao].rotulo.toLowerCase()}</h2>
                    <p className="dica">
                      {dados && dados.totalLinhas > dados.linhas.length ? `Top ${dados.linhas.length} de ${dados.totalLinhas}` : `${dados?.linhas.length ?? "…"} ${DIMENSOES[dimensao].rotulo.toLowerCase()}(s)`} · clique para filtrar
                    </p>
                  </div>
                  <label className="campo campo-inline">
                    <span className="sr-only">Tipo de gráfico</span>
                    <select value={tipoGrafico} onChange={(e) => setTipoGrafico(e.target.value as TipoGrafico)}>
                      {GRAFICOS_1D.map((t) => <option key={t} value={t}>{TIPOS_GRAFICO[t]}</option>)}
                    </select>
                  </label>
                </div>
                {dados ? (
                  <GraficoAnalise tipo={tipoGrafico} dimensao={dimensao} metrica={metricaGrafico} linhas={dados.linhas}
                    aoClicar={dimensao === "representada" ? (id) => filtrar("representada_id", [id]) : undefined} />
                ) : <div className="esqueleto esqueleto-grafico" />}
                <p className="analise-total">Total: <strong>{dados ? formatarMetrica(metricaGrafico, dados.totais[metricaGrafico]) : "…"}</strong></p>
              </div>

              <div className="dash-card">
                <div className="analise-card-topo">
                  <h2 className="titulo-icone"><Icone nome="arquivo" tamanho={20} /> Detalhamento</h2>
                  <button type="button" className="btn-suave btn-peq" onClick={() => setCompacta((c) => !c)} aria-pressed={compacta}>
                    {compacta ? "Densidade: compacta" : "Densidade: confortável"}
                  </button>
                </div>
                {!dados ? <div className="esqueleto esqueleto-lista" /> : (
                  <>
                    <div className="tabela-wrap">
                      <table className={compacta ? "tabela tabela-compacta" : "tabela"}>
                        <thead>
                          <tr>
                            {preset.colunas.map((c) => {
                              const ativa = ordenacao.campo === c;
                              return (
                                <th key={c} className={ehDimensao(c) ? undefined : "num"} aria-sort={ativa ? (ordenacao.direcao === "asc" ? "ascending" : "descending") : "none"}>
                                  <button type="button" className="th-ordenar" onClick={() => { setPagina(0); setOrdenacao({ campo: c, direcao: ativa && ordenacao.direcao === "desc" ? "asc" : "desc" }); }}>
                                    {rotuloColuna(c)} {ativa ? (ordenacao.direcao === "desc" ? "↓" : "↑") : ""}
                                  </button>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {linhasPagina.map((l, i) => (
                            <tr key={String(l[`${dimensao}__id`] ?? i)}>
                              {preset.colunas.map((c) => (
                                <td key={c} className={ehDimensao(c) ? undefined : `num${c === "variacao_percentual" ? classeVariacao(l[c]) : ""}`}>
                                  {ehDimensao(c)
                                    ? c === "representada"
                                      ? <button type="button" className="btn-link" title="Filtrar por esta representada" onClick={() => filtrar("representada_id", [String(l[`${c}__id`])])}>{rotuloDim(c, l[c])}</button>
                                      : rotuloDim(c as DimensaoId, l[c])
                                    : formatarMetrica(c as MetricaId, l[c])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            {preset.colunas.map((c, i) => (
                              <th key={c} className={ehDimensao(c) ? undefined : "num"}>
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

function GraficoAnalise({ tipo, dimensao, metrica, linhas, aoClicar }: {
  tipo: TipoGrafico; dimensao: DimensaoId; metrica: MetricaId; linhas: ResultadoAgregado["linhas"]; aoClicar?: (id: string) => void;
}) {
  const dados = linhas.map((l) => ({ id: String(l[`${dimensao}__id`] ?? ""), nome: rotuloDim(dimensao, l[dimensao]), valor: Number(l[metrica] ?? 0) }));
  const fmt = (v: unknown) => formatarMetrica(metrica, Number(v));
  const curto = (v: number) => (METRICAS[metrica].unidade === "brl" ? new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v) : String(v));
  const clique = aoClicar ? (_: unknown, i: number) => { const id = dados[i]?.id; if (id) aoClicar(id); } : undefined;
  const rotulo = `${METRICAS[metrica].rotulo} por ${DIMENSOES[dimensao].rotulo}: ${dados.map((d) => `${d.nome} ${fmt(d.valor)}`).join(", ")}`;
  const altura = tipo === "barra_horizontal" ? Math.max(260, dados.length * 36 + 40) : 280;
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

const ehDimensao = (c: string): c is DimensaoId => c in DIMENSOES;
const rotuloColuna = (c: string) => (ehDimensao(c) ? DIMENSOES[c].rotulo : METRICAS[c as MetricaId]?.rotulo ?? c);
const numero = (v: unknown) => (v == null || v === "" ? null : Number(v));
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const classeVariacao = (v: unknown) => (v == null ? "" : Number(v) > 0 ? " texto-ok" : Number(v) < 0 ? " texto-perigo" : "");

function rotuloDim(d: DimensaoId, v: unknown): string {
  const s = v == null ? "—" : String(v);
  if (d === "canal") return ROTULO_CANAL[s] ?? s;
  if (d === "status") return STATUS.find((x) => x.id === s)?.nome ?? s;
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
