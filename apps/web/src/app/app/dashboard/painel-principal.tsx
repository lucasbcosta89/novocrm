"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CardKpi as CardKpiBase } from "@/components/card-kpi";
import { Icone, type NomeIcone } from "@/components/icones";
import { PERIODOS, type Periodo } from "@/lib/dashboard";
import type { BlocoAlerta, DashboardPrincipal, Kpi } from "@/server/dashboard-principal";
import { EditarTarefa } from "./editar-tarefa";
import { GraficoComissoes, GraficoVendas } from "./graficos";

const CHAVE_LOCAL = "plurima.dashboard.filtros";
const ROTULO_PERIODO: Record<Periodo, string> = { "3m": "Últimos 3 meses", "6m": "Últimos 6 meses", "12m": "Últimos 12 meses", ano: "Este ano" };
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
/** dd/MM (data AAAA-MM-DD ou ISO, fuso de Brasília). */
const ddmm = (d: string) =>
  new Date(d.length === 10 ? `${d}T12:00:00-03:00` : d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
/** Tarefas (rota "/app" no endpoint) abrem no Calendário, onde aparecem. */
const rota = (r: string) => (r === "/app" ? "/app/calendario" : r);

type Estado = { chave: string; dados: DashboardPrincipal | null; erro: string | null };

/**
 * Dashboard principal: consome só GET /api/dashboard (Fase 9-1). Filtros na query string
 * (?representada=&periodo=) e no localStorage; uma chamada por mudança de filtro.
 */
export function PainelPrincipal({ representadas, dataExtenso }: { representadas: { id: string; nome: string }[]; dataExtenso: string }) {
  const params = useSearchParams();
  const caminho = usePathname();
  const repUrl = params.get("representada");
  const perUrl = params.get("periodo");
  const temFiltro = repUrl !== null && perUrl !== null;
  const representada = repUrl && representadas.some((r) => r.id === repUrl) ? repUrl : "todas";
  const periodo: Periodo = (PERIODOS as readonly string[]).includes(perUrl ?? "") ? (perUrl as Periodo) : "6m";
  const chave = `${representada}|${periodo}`;
  const [estado, setEstado] = useState<Estado>({ chave: "", dados: null, erro: null });
  // popup de edição de tarefa aberto a partir dos alertas; versao recarrega os dados após salvar
  const [editando, setEditando] = useState<{ tipo: "subtarefa" | "tarefa"; id: string; rota: string } | null>(null);
  const [versao, setVersao] = useState(0);

  function aplicar(rep: string, per: Periodo) {
    try {
      localStorage.setItem(CHAVE_LOCAL, JSON.stringify({ representada: rep, periodo: per }));
    } catch {
      // sem armazenamento local: o filtro vale só pela URL
    }
    // sem ida ao servidor: só a query string muda (useSearchParams acompanha)
    window.history.replaceState(null, "", `${caminho}?representada=${rep}&periodo=${per}`);
  }

  useEffect(() => {
    // primeira visita sem filtros na URL: restaura a última escolha (ou o padrão) e só então busca
    if (!temFiltro) {
      let salvo: { representada?: string; periodo?: string } = {};
      try {
        salvo = JSON.parse(localStorage.getItem(CHAVE_LOCAL) ?? "{}");
      } catch {
        salvo = {};
      }
      const rep = salvo.representada && (salvo.representada === "todas" || representadas.some((r) => r.id === salvo.representada)) ? salvo.representada : "todas";
      const per = (PERIODOS as readonly string[]).includes(salvo.periodo ?? "") ? (salvo.periodo as Periodo) : "6m";
      window.history.replaceState(null, "", `${caminho}?representada=${rep}&periodo=${per}`);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/dashboard?periodo=${periodo}&representada_id=${representada}`, { signal: ctrl.signal })
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro ?? "Falha ao carregar o dashboard");
        setEstado({ chave, dados: corpo as DashboardPrincipal, erro: null });
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setEstado({ chave, dados: null, erro: e instanceof Error ? e.message : "Falha ao carregar o dashboard" });
      });
    return () => ctrl.abort();
  }, [temFiltro, representada, periodo, chave, caminho, representadas, versao]);

  const carregando = estado.chave !== chave;
  const d = carregando ? null : estado.dados;
  const nomeRep = d?.meta.representada_nome ?? representadas.find((r) => r.id === representada)?.nome ?? null;
  const filtroComissao = representada !== "todas" ? `&representada=${representada}` : "";

  return (
    <div className="dash">
      <header className="dash-cabecalho">
        <div>
          <h1>Dashboard</h1>
          <p className="subtitulo">
            {representada !== "todas" && nomeRep ? (
              <>
                <strong>{nomeRep}</strong> · <Link href={`/app/representadas/${representada}`}>Ver representada</Link> · {ROTULO_PERIODO[periodo]}
              </>
            ) : (
              <>{dataExtenso} · Todas as representadas · {ROTULO_PERIODO[periodo]}</>
            )}
          </p>
        </div>
        <div className="dash-filtros">
          <label className="campo">
            <span>Representada</span>
            <select value={representada} onChange={(e) => aplicar(e.target.value, periodo)}>
              <option value="todas">Todas as representadas</option>
              {representadas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Período</span>
            <select value={periodo} onChange={(e) => aplicar(representada, e.target.value as Periodo)}>
              {PERIODOS.map((p) => <option key={p} value={p}>{ROTULO_PERIODO[p]}</option>)}
            </select>
          </label>
        </div>
      </header>

      {!carregando && estado.erro && (
        <p className="aviso aviso-erro" role="alert"><span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>{estado.erro}</p>
      )}

      {/* KPIs */}
      <section className="dash-kpis" aria-busy={carregando} aria-label="Indicadores">
        {d ? (
          <>
            <CardKpi titulo="Vendas no mês" kpi={d.kpis.vendas_mes_atual} icone="tendencia" tom="tom-azul"
              href={representada !== "todas" ? `/app/representadas/${representada}/pedidos` : "/app/representadas"} />
            <CardKpi titulo="Comissões a receber" kpi={d.kpis.comissao_a_receber} icone="relogio" tom="tom-violeta" href={`/app/comissoes?status=a_receber${filtroComissao}`} />
            <CardKpi titulo="Comissões recebidas" kpi={d.kpis.comissao_recebida} icone="concluido" tom="tom-ok" href={`/app/comissoes?status=recebida${filtroComissao}`} />
            <CardKpi titulo="Comissões em atraso" kpi={d.kpis.comissao_atrasada} icone="alerta" tom={d.kpis.comissao_atrasada.valor > 0 ? "tom-perigo" : "tom-neutro"}
              href={`/app/comissoes?status=atrasada${filtroComissao}`} inverso />
            <CardKpi titulo="Oportunidades em aberto" kpi={d.kpis.oportunidades_abertas} icone="funil" tom="tom-ciano" href="/app/oportunidades" numero />
            <CardKpi titulo="Ticket médio" kpi={d.kpis.ticket_medio} icone="carrinho" tom="tom-rosa"
              href={representada !== "todas" ? `/app/representadas/${representada}/pedidos` : "/app/representadas"} />
            <CardKpi titulo="Custos" kpi={d.kpis.custos_total} icone="carteira" tom="tom-perigo" inverso
              href={`/app/custos?p=este_mes${representada !== "todas" ? `&rep=${representada}` : ""}`} />
            <CardKpi titulo="Resultado" kpi={d.kpis.resultado_liquido} icone="tendencia" tom={d.kpis.resultado_liquido.valor >= 0 ? "tom-ok" : "tom-perigo"}
              href={`/app/custos${representada !== "todas" ? `?rep=${representada}` : ""}`} />
          </>
        ) : (
          Array.from({ length: 8 }, (_, i) => <div key={i} className="dash-card esqueleto esqueleto-kpi" />)
        )}
      </section>

      {/* Gráficos */}
      <section className="dash-graficos">
        <div className="dash-card">
          <h2 className="titulo-icone"><Icone nome="grafico" tamanho={20} /> Vendas por mês</h2>
          {d ? (
            d.serie_vendas.some((s) => s.valor > 0) ? <GraficoVendas dados={d.serie_vendas} /> : <Vazio texto="Nenhuma venda confirmada neste período." />
          ) : <div className="esqueleto esqueleto-grafico" />}
        </div>
        <div className="dash-card">
          <h2 className="titulo-icone"><Icone nome="cifrao" tamanho={20} /> Comissões x custos por mês</h2>
          {d ? (
            d.serie_comissoes.some((s) => s.a_receber + s.recebida + s.atrasada > 0) || d.serie_custos.some((c) => c.valor > 0)
              ? <GraficoComissoes dados={d.serie_comissoes.map((c, i) => ({ ...c, custos: d.serie_custos[i]?.valor ?? 0 }))} />
              : <Vazio texto="Nenhuma comissão prevista neste período." />
          ) : <div className="esqueleto esqueleto-grafico" />}
        </div>
      </section>

      {/* Alertas + próximas ações */}
      <section className="dash-meio">
        <div className="dash-card">
          <h2 className="titulo-icone"><Icone nome="sino" tamanho={20} /> Alertas</h2>
          {d ? <Alertas a={d.alertas} filtroComissao={filtroComissao} onEditar={setEditando} /> : <div className="esqueleto esqueleto-lista" />}
        </div>
        <div className="dash-card">
          <h2 className="titulo-icone"><Icone nome="calendario" tamanho={20} /> Próximas ações</h2>
          {d ? (
            d.proximas_acoes.length === 0 ? (
              <Vazio texto="Nada agendado por enquanto. Que tal planejar a próxima visita?" />
            ) : (
              <ul className="dash-acoes">
                {d.proximas_acoes.map((a) => (
                  <li key={`${a.tipo}-${a.id}`}>
                    <Link href={rota(a.rota_edicao)}>
                      <span className="dash-data">{ddmm(a.data)}</span>
                      <span className={`etiqueta etiqueta-tipo-${a.tipo}`}>{a.tipo === "visita" ? "Visita" : a.tipo === "subtarefa" ? "Sub-tarefa" : "Tarefa"}</span>
                      <span className="dash-acao-titulo">{a.titulo}{a.detalhe && a.tipo !== "visita" && <span className="item-sub">{a.detalhe}</span>}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : <div className="esqueleto esqueleto-lista" />}
        </div>
      </section>

      {/* Rankings e positivação */}
      {d ? (
        <section className="dash-rodape">
          {representada === "todas" && d.extras.top_representadas.length > 0 && (
            <Ranking titulo="Top representadas" icone="predio" itens={d.extras.top_representadas.map((r) => ({ id: r.id, nome: r.nome, valor: r.valor, href: `/app/representadas/${r.id}` }))} brl />
          )}
          {d.extras.top_clientes.length > 0 && (
            <Ranking titulo="Top clientes" icone="pessoas" itens={d.extras.top_clientes.map((c) => ({ id: c.id, nome: c.nome, valor: c.valor, href: `/app/clientes/${c.id}` }))} brl />
          )}
          {d.extras.top_produtos.length > 0 && (
            <Ranking titulo="Top produtos" icone="pacote" itens={d.extras.top_produtos.map((p) => ({ id: p.id, nome: p.sku ? `${p.nome} (${p.sku})` : p.nome, valor: p.quantidade }))} />
          )}
          {d.extras.positivacao.carteira > 0 && (
            <div className="dash-card">
              <h2 className="titulo-icone"><Icone nome="alvo" tamanho={20} /> Positivação</h2>
              <p className="dash-positivacao">{pct(d.extras.positivacao.pct)}</p>
              <div className="barra barra-larga" role="img" aria-label={`${pct(d.extras.positivacao.pct)} da carteira comprou`}>
                <span style={{ width: `${Math.min(100, d.extras.positivacao.pct)}%` }} />
              </div>
              <p className="dica">{d.extras.positivacao.compraram} de {d.extras.positivacao.carteira} clientes da carteira compraram no período.</p>
            </div>
          )}
        </section>
      ) : (
        <section className="dash-rodape">{Array.from({ length: 3 }, (_, i) => <div key={i} className="dash-card esqueleto esqueleto-lista" />)}</section>
      )}

      {editando && (
        <EditarTarefa
          tipo={editando.tipo}
          id={editando.id}
          rotaOrigem={editando.rota}
          onFechar={() => setEditando(null)}
          onSalva={() => {
            setEditando(null);
            setVersao((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

/** Adaptador: KPI do endpoint → card compartilhado (components/card-kpi). */
function CardKpi({ titulo, kpi, icone, tom, href, inverso = false, numero = false }: {
  titulo: string; kpi: Kpi; icone: NomeIcone; tom: string; href: string; inverso?: boolean; numero?: boolean;
}) {
  return <CardKpiBase titulo={titulo} valor={numero ? kpi.valor.toLocaleString("pt-BR") : brl.format(kpi.valor)} variacao={kpi.variacao_pct} icone={icone} tom={tom} href={href} inverso={inverso} />;
}

const ALERTAS: { chave: keyof DashboardPrincipal["alertas"]; titulo: string; nivel: "vermelho" | "amarelo" | "azul"; icone: NomeIcone; href: (f: string) => string }[] = [
  { chave: "tarefas_vencidas", titulo: "Tarefas vencidas", nivel: "vermelho", icone: "alerta", href: () => "/app/calendario" },
  { chave: "comissoes_atrasadas", titulo: "Comissões atrasadas", nivel: "vermelho", icone: "cifrao", href: (f) => `/app/comissoes?status=atrasada${f}` },
  { chave: "visitas_atrasadas", titulo: "Visitas atrasadas", nivel: "vermelho", icone: "mapa", href: () => "/app/calendario" },
  { chave: "tarefas_a_vencer", titulo: "Vencem em 7 dias", nivel: "amarelo", icone: "relogio", href: () => "/app/calendario" },
  { chave: "oportunidades_paradas", titulo: "Oportunidades paradas (+30 dias)", nivel: "azul", icone: "funil", href: () => "/app/oportunidades/funis" },
];

/** Alertas de tarefas (vencidas / a vencer) abrem o popup de edição; os demais levam à origem. */
const EDITAVEIS = new Set<string>(["tarefas_vencidas", "tarefas_a_vencer"]);

function Alertas({ a, filtroComissao, onEditar }: {
  a: DashboardPrincipal["alertas"]; filtroComissao: string; onEditar: (t: { tipo: "subtarefa" | "tarefa"; id: string; rota: string }) => void;
}) {
  const ativos = ALERTAS.filter((x) => a[x.chave].total > 0);
  if (ativos.length === 0) return <Vazio texto="Tudo em dia: nenhum alerta no momento." />;
  return (
    <div className="dash-alertas">
      {ativos.map((x) => {
        const b: BlocoAlerta = a[x.chave];
        return (
          <div key={x.chave} className={`dash-alerta alerta-${x.nivel}`}>
            <Link href={x.href(filtroComissao)} className="dash-alerta-topo">
              <span className="circulo-icone"><Icone nome={x.icone} tamanho={16} /></span>
              <span className="dash-alerta-titulo">{x.titulo}</span>
              <span className="dash-alerta-total">{b.total}</span>
            </Link>
            <ul>
              {b.itens.slice(0, 3).map((i) => (
                <li key={`${i.tipo}-${i.id}`}>
                  {EDITAVEIS.has(x.chave) && (i.tipo === "subtarefa" || i.tipo === "tarefa") ? (
                    <button type="button" className="link-alerta" onClick={() => onEditar({ tipo: i.tipo as "subtarefa" | "tarefa", id: i.id, rota: rota(i.rota_edicao) })}>
                      {i.titulo}
                    </button>
                  ) : (
                    <Link href={rota(i.rota_edicao)}>{i.titulo}</Link>
                  )}
                  {i.data && <span className="item-sub"> · {ddmm(i.data)}</span>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Ranking({ titulo, icone, itens, brl: emReais = false }: {
  titulo: string; icone: NomeIcone; itens: { id: string; nome: string; valor: number; href?: string }[]; brl?: boolean;
}) {
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <div className="dash-card">
      <h2 className="titulo-icone"><Icone nome={icone} tamanho={20} /> {titulo}</h2>
      <ol className="dash-ranking">
        {itens.map((i) => (
          <li key={i.id}>
            <span className="dash-ranking-linha">
              {i.href ? <Link href={i.href}>{i.nome}</Link> : <span>{i.nome}</span>}
              <span className="dash-ranking-valor">{emReais ? brl.format(i.valor) : `${i.valor.toLocaleString("pt-BR")} un.`}</span>
            </span>
            <span className="dash-proporcao"><span style={{ width: `${(i.valor / max) * 100}%` }} /></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div className="vazio dash-vazio">{texto}</div>;
}
