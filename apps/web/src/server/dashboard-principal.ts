import "server-only";
import {
  centavos, dashboardQuerySchema, diaSP, janelas, mesSP, naJanela, serieMensal, somarPor, topN, variacao, type Periodo,
} from "@/lib/dashboard";
import { emAberto } from "@/lib/funis";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

/* ---------- Tipos do payload ---------- */

export type Kpi = { valor: number; variacao_pct: number | null };
export type ItemAlerta = { id: string; tipo: string; titulo: string; data: string | null; detalhe: string | null; rota_edicao: string };
export type BlocoAlerta = { total: number; itens: ItemAlerta[] };
export type ProximaAcao = { id: string; tipo: "visita" | "subtarefa" | "tarefa"; titulo: string; data: string; detalhe: string | null; rota_edicao: string };

export type DashboardPrincipal = {
  meta: { periodo: Periodo; representada_id: string; representada_nome: string | null; atualizado_em: string; meses: string[]; cache: "hit" | "miss" };
  kpis: Record<
    | "vendas_total" | "vendas_mes_atual" | "comissao_a_receber" | "comissao_recebida" | "comissao_atrasada" | "oportunidades_abertas" | "ticket_medio" | "taxa_conversao"
    // Fase 11: custos = despesas do período; bruto = comissões recebidas; líquido = bruto − custos
    | "custos_total" | "resultado_bruto" | "resultado_liquido",
    Kpi
  >;
  serie_vendas: { mes: string; valor: number }[];
  serie_comissoes: { mes: string; a_receber: number; recebida: number; atrasada: number }[];
  serie_custos: { mes: string; valor: number }[];
  alertas: Record<"tarefas_vencidas" | "tarefas_a_vencer" | "comissoes_atrasadas" | "visitas_atrasadas" | "oportunidades_paradas", BlocoAlerta>;
  proximas_acoes: ProximaAcao[];
  extras: {
    top_representadas: { id: string; nome: string; valor: number }[];
    top_clientes: { id: string; nome: string; valor: number }[];
    top_produtos: { id: string; nome: string; sku: string | null; quantidade: number }[];
    positivacao: { compraram: number; carteira: number; pct: number };
  };
};

/* ---------- Linhas lidas ---------- */

type Nome = { nome: string } | null;
type PedidoRow = { id: string; data: string; valor_total: number; cliente_id: string; representada_id: string; cliente: Nome; representada: Nome };
type ItemRow = { quantidade: number; produto_id: string | null; produto: { nome: string; sku: string } | null };
type ComissaoRow = { id: string; valor: number; status: string; data_prevista: string | null; pedido: { id: string; codigo_pedido: string; cliente: Nome } | null };
type OpRow = {
  id: string; titulo: string; status: string; resultado: string | null; data_conclusao: string | null; criado_em: string;
  atualizado_em: string | null; arquivada: boolean; cliente_id: string | null; funil_id: string | null; cliente: Nome;
};
type AcaoRow = {
  id: string; descricao: string; prazo: string; status: string;
  oportunidade: { id: string; titulo: string; cliente_id: string | null; funil_id: string | null; cliente: Nome } | null;
};
type TarefaRow = { id: string; titulo: string; data: string; cliente_id: string | null; cliente: Nome };
type VisitaRow = { id: string; data: string; cliente_id: string; cliente: Nome };
type DespesaRow = { valor: number; data: string };

const VENDA = ["confirmado", "entregue"];
const LIMITE = 5000;
const rotaOportunidade = (o: { id: string; cliente_id: string | null; funil_id: string | null } | null) =>
  !o ? "/app/oportunidades" : o.cliente_id ? `/app/clientes/${o.cliente_id}/oportunidades/${o.id}` : o.funil_id ? `/app/oportunidades/funis/${o.funil_id}` : "/app/oportunidades";
const bloco = (itens: ItemAlerta[]): BlocoAlerta => ({ total: itens.length, itens: itens.slice(0, 5) });

/* ---------- Cache (60s, por usuário + período + representada) ---------- */

const TTL_MS = 60_000;
const cache = new Map<string, { expira: number; dados: Omit<DashboardPrincipal, "meta"> & { meta: Omit<DashboardPrincipal["meta"], "cache"> } }>();

/** Edição feita pelo próprio dashboard: descarta o cache do usuário para a próxima leitura vir atualizada. */
export function limparCacheDashboard(userId: string) {
  for (const k of cache.keys()) if (k.startsWith(`${userId}|`)) cache.delete(k);
}

/**
 * Dashboard principal: KPIs (com variação vs período anterior), séries mensais, alertas,
 * próximas ações e rankings — numa única resposta. Número fixo de consultas (sem N+1); a
 * agregação mensal é feita em memória sobre o resultado de cada consulta. Filtro por representada
 * em todos os blocos. Cache de 60s.
 */
export async function obterDashboardPrincipal(ctx: Contexto, query: unknown): Promise<DashboardPrincipal> {
  const q = dashboardQuerySchema.parse(query);
  const chave = `${ctx.userId}|${q.periodo}|${q.representada_id}`;
  const guardado = cache.get(chave);
  if (guardado && guardado.expira > Date.now()) return { ...guardado.dados, meta: { ...guardado.dados.meta, cache: "hit" } };

  const dados = await calcular(ctx, q.periodo, q.representada_id === "todas" ? null : q.representada_id);
  cache.set(chave, { expira: Date.now() + TTL_MS, dados });
  if (cache.size > 500) for (const [k, v] of cache) if (v.expira <= Date.now()) cache.delete(k);
  return { ...dados, meta: { ...dados.meta, cache: "miss" } };
}

async function calcular(ctx: Contexto, periodo: Periodo, rep: string | null) {
  const { supabase } = ctx;
  const agora = new Date();
  const hoje = diaSP(agora);
  const em7 = diaSP(new Date(agora.getTime() + 7 * 86_400_000));
  const ha30 = new Date(agora.getTime() - 30 * 86_400_000).toISOString();
  const { atual, anterior } = janelas(periodo, agora);
  const mesAtual = mesSP(agora);
  const mesAnterior = janelas("3m", agora).atual.meses[1]!; // mês imediatamente anterior ao atual
  const inicioLeitura = [anterior.inicio, `${mesAnterior}-01T00:00:00-03:00`].sort((a, b) => Date.parse(a) - Date.parse(b))[0]!;
  const isoUtc = (s: string) => new Date(s).toISOString();

  // representada precisa ser do usuário (RLS esconde as de outros → 403)
  let representadaNome: string | null = null;
  if (rep) {
    const { data, error } = await supabase.from("representadas").select("id, nome").eq("id", rep).maybeSingle<{ id: string; nome: string }>();
    if (error) throw erroBanco(error);
    if (!data) throw new AppError(403, "Representada não encontrada ou sem acesso", "rls");
    representadaNome = data.nome;
  }

  let pedidosQ = supabase
    .from("pedidos")
    .select("id, data, valor_total, cliente_id, representada_id, cliente:clientes(nome), representada:representadas(nome)")
    .in("status", VENDA)
    .gte("data", isoUtc(inicioLeitura));
  let itensQ = supabase
    .from("pedido_itens")
    .select("quantidade, produto_id, produto:produtos(nome, sku), pedido:pedidos!inner(data, status, representada_id)")
    .in("pedido.status", VENDA)
    .gte("pedido.data", isoUtc(atual.inicio));
  let comissoesQ = supabase
    .from("comissoes")
    .select("id, valor, status, data_prevista, pedido:pedidos(id, codigo_pedido, cliente:clientes(nome))")
    .neq("status", "cancelada")
    .or(`data_prevista.gte."${isoUtc(anterior.inicio)}",status.eq.atrasada`);
  let opsQ = supabase
    .from("oportunidades_desafios")
    .select("id, titulo, status, resultado, data_conclusao, criado_em, atualizado_em, arquivada, cliente_id, funil_id, cliente:clientes(nome)");
  let acoesQ = supabase
    .from("plano_acao")
    .select("id, descricao, prazo, status, oportunidade:oportunidades_desafios!inner(id, titulo, cliente_id, funil_id, representada_id, arquivada, cliente:clientes(nome))")
    .not("prazo", "is", null)
    .not("status", "in", "(concluido,cancelado)")
    .eq("oportunidade.arquivada", false)
    .order("prazo");
  let tarefasQ = supabase
    .from("tarefas")
    .select("id, titulo, data, cliente_id, cliente:clientes(nome)")
    .eq("concluida", false)
    .not("data", "is", null)
    .order("data");
  let visitasQ = supabase
    .from("visitas")
    .select("id, data, cliente_id, cliente:clientes(nome)")
    .gte("data", agora.toISOString())
    .order("data")
    .limit(8);
  // despesas (Fase 11): com representada selecionada, só as vinculadas a ela (despesa_representadas)
  let despesasQ = supabase
    .from("despesas")
    .select(rep ? "valor, data, vinculo:despesa_representadas!inner(representada_id)" : "valor, data")
    .gte("data", diaSP(anterior.inicio))
    .lt("data", diaSP(atual.fim)); // fim = 1º dia do mês seguinte
  if (rep) despesasQ = despesasQ.eq("vinculo.representada_id", rep);
  const carteiraQ = rep
    ? supabase.from("cliente_representada").select("cliente_id", { count: "exact", head: true }).eq("representada_id", rep)
    : supabase.from("clientes").select("id", { count: "exact", head: true });

  if (rep) {
    pedidosQ = pedidosQ.eq("representada_id", rep);
    itensQ = itensQ.eq("pedido.representada_id", rep);
    comissoesQ = comissoesQ.eq("representada_id", rep);
    opsQ = opsQ.eq("representada_id", rep);
    acoesQ = acoesQ.eq("oportunidade.representada_id", rep);
    tarefasQ = tarefasQ.eq("representada_id", rep); // tarefas têm representada_id
    visitasQ = visitasQ.eq("representada_id", rep); // visitas têm representada_id
  }

  const [pedidosR, itensR, comissoesR, opsR, acoesR, tarefasR, visitasR, carteiraR, despesasR] = await Promise.all([
    pedidosQ.limit(LIMITE).returns<PedidoRow[]>(),
    itensQ.limit(LIMITE * 4).returns<ItemRow[]>(),
    comissoesQ.limit(LIMITE).returns<ComissaoRow[]>(),
    opsQ.limit(LIMITE).returns<OpRow[]>(),
    acoesQ.limit(LIMITE).returns<AcaoRow[]>(),
    tarefasQ.limit(LIMITE).returns<TarefaRow[]>(),
    visitasQ.returns<VisitaRow[]>(),
    carteiraQ,
    despesasQ.limit(LIMITE).returns<DespesaRow[]>(),
  ]);
  for (const r of [pedidosR, itensR, comissoesR, opsR, acoesR, tarefasR, visitasR, carteiraR, despesasR]) if (r.error) throw erroBanco(r.error);
  const despesas = despesasR.data ?? [];
  const custosNa = (j: typeof atual) => despesas.filter((d) => naJanela(d.data, j)).reduce((t, d) => t + Number(d.valor), 0);
  const custosPorMes = somarPor(despesas, (d) => d.data.slice(0, 7), (d) => Number(d.valor));
  const pedidos = pedidosR.data ?? [];
  const comissoes = comissoesR.data ?? [];
  const ops = opsR.data ?? [];
  const acoes = acoesR.data ?? [];
  const tarefas = tarefasR.data ?? [];

  /* Vendas */
  const vendasAtual = pedidos.filter((p) => naJanela(p.data, atual));
  const vendasAnterior = pedidos.filter((p) => naJanela(p.data, anterior));
  const soma = (xs: PedidoRow[]) => xs.reduce((t, p) => t + Number(p.valor_total), 0);
  const porMes = somarPor(pedidos, (p) => mesSP(p.data), (p) => Number(p.valor_total));
  const totalAtual = soma(vendasAtual);
  const totalAnterior = soma(vendasAnterior);
  const ticket = (xs: PedidoRow[]) => (xs.length ? soma(xs) / xs.length : 0);

  /* Comissões (por data_prevista no período; canceladas fora) */
  const comissaoNa = (j: typeof atual, status: string) =>
    comissoes.filter((c) => c.status === status && naJanela(c.data_prevista, j)).reduce((t, c) => t + Number(c.valor), 0);
  const serieComissoes = atual.meses.map((mes) => {
    const doMes = comissoes.filter((c) => c.data_prevista && mesSP(c.data_prevista) === mes);
    const s = (st: string) => centavos(doMes.filter((c) => c.status === st).reduce((t, c) => t + Number(c.valor), 0));
    return { mes, a_receber: s("a_receber"), recebida: s("recebida"), atrasada: s("atrasada") };
  });

  /* Oportunidades */
  const abertas = ops.filter(emAberto);
  const criadasEmAberto = (j: typeof atual) => abertas.filter((o) => naJanela(o.criado_em, j)).length;
  const conversao = (j: typeof atual) => {
    const decididas = ops.filter((o) => o.resultado && naJanela(o.data_conclusao, j));
    const ganhas = decididas.filter((o) => o.resultado === "ganhou").length;
    return decididas.length ? Math.round((ganhas / decididas.length) * 1000) / 10 : 0;
  };

  const k = (valor: number, ant: number): Kpi => ({ valor: centavos(valor), variacao_pct: variacao(centavos(valor), centavos(ant)) });
  const kpis: DashboardPrincipal["kpis"] = {
    vendas_total: k(totalAtual, totalAnterior),
    vendas_mes_atual: k(porMes.get(mesAtual) ?? 0, porMes.get(mesAnterior) ?? 0),
    comissao_a_receber: k(comissaoNa(atual, "a_receber"), comissaoNa(anterior, "a_receber")),
    comissao_recebida: k(comissaoNa(atual, "recebida"), comissaoNa(anterior, "recebida")),
    comissao_atrasada: k(comissaoNa(atual, "atrasada"), comissaoNa(anterior, "atrasada")),
    // valor = em aberto agora; variação = abertas criadas no período vs no anterior
    oportunidades_abertas: { valor: abertas.length, variacao_pct: variacao(criadasEmAberto(atual), criadasEmAberto(anterior)) },
    ticket_medio: k(ticket(vendasAtual), ticket(vendasAnterior)),
    taxa_conversao: { valor: conversao(atual), variacao_pct: variacao(conversao(atual), conversao(anterior)) },
    custos_total: k(custosNa(atual), custosNa(anterior)),
    resultado_bruto: k(comissaoNa(atual, "recebida"), comissaoNa(anterior, "recebida")),
    resultado_liquido: k(comissaoNa(atual, "recebida") - custosNa(atual), comissaoNa(anterior, "recebida") - custosNa(anterior)),
  };

  /* Alertas (situação atual, não dependem do período) */
  const itemAcao = (a: AcaoRow): ItemAlerta => ({
    id: a.id, tipo: "subtarefa", titulo: a.descricao, data: a.prazo,
    detalhe: [a.oportunidade?.titulo, a.oportunidade?.cliente?.nome].filter(Boolean).join(" · ") || null,
    rota_edicao: rotaOportunidade(a.oportunidade),
  });
  const itemTarefa = (t: TarefaRow): ItemAlerta => ({ id: t.id, tipo: "tarefa", titulo: t.titulo, data: t.data, detalhe: t.cliente?.nome ?? null, rota_edicao: "/app" });
  const porData = (a: ItemAlerta, b: ItemAlerta) => (a.data ?? "").localeCompare(b.data ?? "");
  const vencidas = [...acoes.filter((a) => a.prazo < hoje).map(itemAcao), ...tarefas.filter((t) => t.data < hoje).map(itemTarefa)].sort(porData);
  const aVencer = [
    ...acoes.filter((a) => a.prazo >= hoje && a.prazo <= em7).map(itemAcao),
    ...tarefas.filter((t) => t.data >= hoje && t.data <= em7).map(itemTarefa),
  ].sort(porData);
  const atrasadas = comissoes
    .filter((c) => c.status === "atrasada")
    .sort((a, b) => (a.data_prevista ?? "").localeCompare(b.data_prevista ?? ""))
    .map((c): ItemAlerta => ({
      id: c.id, tipo: "comissao", titulo: `Comissão ${c.pedido?.codigo_pedido ?? ""}`.trim(), data: c.data_prevista,
      detalhe: [c.pedido?.cliente?.nome, `R$ ${Number(c.valor).toFixed(2).replace(".", ",")}`].filter(Boolean).join(" · "),
      rota_edicao: c.pedido ? `/app/pedidos/${c.pedido.id}` : "/app/comissoes?status=atrasada",
    }));
  const paradas = abertas
    .filter((o) => (o.atualizado_em ?? o.criado_em) < ha30)
    .sort((a, b) => (a.atualizado_em ?? a.criado_em).localeCompare(b.atualizado_em ?? b.criado_em))
    .map((o): ItemAlerta => ({ id: o.id, tipo: "oportunidade", titulo: o.titulo, data: o.atualizado_em ?? o.criado_em, detalhe: o.cliente?.nome ?? null, rota_edicao: rotaOportunidade(o) }));

  /* Próximas ações (até 8, por data) */
  const proximas: ProximaAcao[] = [
    ...(visitasR.data ?? []).map((v): ProximaAcao => ({
      id: v.id, tipo: "visita", titulo: `Visita ${v.cliente?.nome ?? ""}`.trim(), data: v.data, detalhe: v.cliente?.nome ?? null,
      rota_edicao: `/app/clientes/${v.cliente_id}/visitas#visita-${v.id}`,
    })),
    ...acoes.filter((a) => a.prazo >= hoje).slice(0, 8).map((a) => ({ ...itemAcao(a), tipo: "subtarefa" as const, data: a.prazo })),
    ...tarefas.filter((t) => t.data >= hoje).slice(0, 8).map((t) => ({ ...itemTarefa(t), tipo: "tarefa" as const, data: t.data })),
  ]
    .sort((a, b) => Date.parse(a.data.length === 10 ? `${a.data}T12:00:00-03:00` : a.data) - Date.parse(b.data.length === 10 ? `${b.data}T12:00:00-03:00` : b.data))
    .slice(0, 8);

  /* Extras */
  const nomesRep = new Map(vendasAtual.map((p) => [p.representada_id, p.representada?.nome ?? "—"] as const));
  const nomesCli = new Map(vendasAtual.map((p) => [p.cliente_id, p.cliente?.nome ?? "—"] as const));
  const qtdProduto = somarPor(itensR.data ?? [], (i) => i.produto_id, (i) => Number(i.quantidade));
  const produtoInfo = new Map((itensR.data ?? []).filter((i) => i.produto_id).map((i) => [i.produto_id!, i.produto] as const));
  const compraram = new Set(vendasAtual.map((p) => p.cliente_id)).size;
  const carteira = carteiraR.count ?? 0;

  return {
    meta: { periodo, representada_id: rep ?? "todas", representada_nome: representadaNome, atualizado_em: agora.toISOString(), meses: atual.meses },
    kpis,
    serie_vendas: serieMensal(atual.meses, porMes),
    serie_comissoes: serieComissoes,
    serie_custos: serieMensal(atual.meses, custosPorMes),
    alertas: {
      tarefas_vencidas: bloco(vencidas),
      tarefas_a_vencer: bloco(aVencer),
      comissoes_atrasadas: bloco(atrasadas),
      // visitas não têm status no banco (Fase 3c pendente): visita passada = realizada → nunca atrasada
      visitas_atrasadas: bloco([]),
      oportunidades_paradas: bloco(paradas),
    },
    proximas_acoes: proximas,
    extras: {
      top_representadas: rep ? [] : topN(somarPor(vendasAtual, (p) => p.representada_id, (p) => Number(p.valor_total)), nomesRep),
      top_clientes: topN(somarPor(vendasAtual, (p) => p.cliente_id, (p) => Number(p.valor_total)), nomesCli),
      top_produtos: [...qtdProduto.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, quantidade]) => ({ id, nome: produtoInfo.get(id)?.nome ?? "—", sku: produtoInfo.get(id)?.sku ?? null, quantidade: Math.round(quantidade * 1000) / 1000 })),
      positivacao: { compraram, carteira, pct: carteira ? Math.round((compraram / carteira) * 1000) / 10 : 0 },
    },
  };
}
