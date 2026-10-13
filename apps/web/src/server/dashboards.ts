import { paraInputDataHora } from "@/lib/formato";
import { mesAtual } from "@/lib/planos";
import { idSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { erroBanco } from "./erros";

/** Alertas: tarefas pendentes e visitas com data nos próximos 7 dias (visita com data futura = agendada). */
export type Alerta = { tipo: "tarefa" | "visita"; id: string; titulo: string; data: string; href: string };
export type Painel = { vendasTotal: number; vendasMes: number; pedidos: number; visitas: number; alertas: Alerta[] };

const DIAS_ALERTA = 7;
const VALIDOS = ["confirmado", "entregue"]; // rascunho e cancelado não contam como venda

function janela() {
  const hoje = paraInputDataHora().slice(0, 10);
  const fim = new Date(Date.parse(`${hoje}T12:00:00Z`) + DIAS_ALERTA * 864e5).toISOString().slice(0, 10);
  const agora = new Date();
  return { hoje, fim, agoraIso: agora.toISOString(), fimIso: new Date(agora.getTime() + DIAS_ALERTA * 864e5).toISOString() };
}

const soma = (xs: { valor_total: number }[]) => Math.round(xs.reduce((s, p) => s + Number(p.valor_total), 0) * 100) / 100;

function inicioMes() {
  const [ano, mes] = mesAtual().split("-");
  return `${ano}-${mes}-01T00:00:00-03:00`;
}

/** Filtro "pertence a": PostgREST or() com a coluna direta e os clientes vinculados. */
const ou = (coluna: string, id: string, clientes: string[]) =>
  clientes.length ? `${coluna}.eq.${id},cliente_id.in.(${clientes.join(",")})` : `${coluna}.eq.${id}`;

type TarefaRow = { id: string; titulo: string; data: string; cliente_id: string | null };
type VisitaRow = { id: string; data: string; tipo: string; cliente: { id: string; nome: string } | null };

function montarAlertas(tarefas: TarefaRow[], visitas: VisitaRow[]): Alerta[] {
  return [
    ...tarefas.map((t) => ({
      tipo: "tarefa" as const, id: t.id, titulo: t.titulo, data: `${t.data}T12:00:00Z`,
      href: t.cliente_id ? `/app/clientes/${t.cliente_id}` : "/app",
    })),
    ...visitas.map((v) => ({
      tipo: "visita" as const, id: v.id, titulo: `Visita (${v.tipo})${v.cliente ? ` — ${v.cliente.nome}` : ""}`, data: v.data,
      href: v.cliente ? `/app/clientes/${v.cliente.id}/visitas#visita-${v.id}` : "/app",
    })),
  ].sort((a, b) => a.data.localeCompare(b.data));
}

/** Painel da representada: vendas (total e mês), visitas (à representada ou aos seus clientes) e alertas. */
export async function painelRepresentada({ supabase }: Contexto, representadaId: string): Promise<Painel> {
  const id = idSchema.parse(representadaId);
  const { data: vinc, error } = await supabase.from("cliente_representada").select("cliente_id").eq("representada_id", id);
  if (error) throw erroBanco(error);
  const clientes = (vinc ?? []).map((v) => v.cliente_id as string);
  const j = janela();

  const [pedidos, visitas, tarefas, agendadas] = await Promise.all([
    supabase.from("pedidos").select("valor_total, data").eq("representada_id", id).in("status", VALIDOS).returns<{ valor_total: number; data: string }[]>(),
    supabase.from("visitas").select("id", { count: "exact", head: true }).or(ou("representada_id", id, clientes)).lte("data", j.agoraIso),
    supabase.from("tarefas").select("id, titulo, data, cliente_id").eq("concluida", false).gte("data", j.hoje).lte("data", j.fim)
      .or(ou("representada_id", id, clientes)).returns<TarefaRow[]>(),
    supabase.from("visitas").select("id, data, tipo, cliente:clientes(id, nome)").gt("data", j.agoraIso).lte("data", j.fimIso)
      .or(ou("representada_id", id, clientes)).returns<VisitaRow[]>(),
  ]);
  for (const r of [pedidos, visitas, tarefas, agendadas]) if (r.error) throw erroBanco(r.error);
  const ped = pedidos.data ?? [];
  return {
    vendasTotal: soma(ped),
    vendasMes: soma(ped.filter((p) => p.data >= inicioMes())),
    pedidos: ped.length,
    visitas: visitas.count ?? 0,
    alertas: montarAlertas(tarefas.data ?? [], agendadas.data ?? []),
  };
}

/** Painel do cliente: vendas (total e mês), visitas feitas e alertas do cliente. */
export async function painelCliente({ supabase }: Contexto, clienteId: string): Promise<Painel> {
  const id = idSchema.parse(clienteId);
  const j = janela();
  const [pedidos, visitas, tarefas, agendadas] = await Promise.all([
    supabase.from("pedidos").select("valor_total, data").eq("cliente_id", id).in("status", VALIDOS).returns<{ valor_total: number; data: string }[]>(),
    supabase.from("visitas").select("id", { count: "exact", head: true }).eq("cliente_id", id).lte("data", j.agoraIso),
    supabase.from("tarefas").select("id, titulo, data, cliente_id").eq("concluida", false).eq("cliente_id", id)
      .gte("data", j.hoje).lte("data", j.fim).returns<TarefaRow[]>(),
    supabase.from("visitas").select("id, data, tipo, cliente:clientes(id, nome)").eq("cliente_id", id)
      .gt("data", j.agoraIso).lte("data", j.fimIso).returns<VisitaRow[]>(),
  ]);
  for (const r of [pedidos, visitas, tarefas, agendadas]) if (r.error) throw erroBanco(r.error);
  const ped = pedidos.data ?? [];
  return {
    vendasTotal: soma(ped),
    vendasMes: soma(ped.filter((p) => p.data >= inicioMes())),
    pedidos: ped.length,
    visitas: visitas.count ?? 0,
    alertas: montarAlertas(tarefas.data ?? [], agendadas.data ?? []),
  };
}

export type OportunidadeDaRepresentada = {
  id: string; titulo: string; tipo: string; status: string; prioridade: string; resultado: string | null;
  cliente: { id: string; nome: string } | null;
};

export async function oportunidadesDaRepresentada({ supabase }: Contexto, representadaId: string): Promise<OportunidadeDaRepresentada[]> {
  const { data, error } = await supabase
    .from("oportunidades_desafios")
    .select("id, titulo, tipo, status, prioridade, resultado, cliente:clientes(id, nome)")
    .eq("representada_id", idSchema.parse(representadaId))
    .order("atualizado_em", { ascending: false })
    .returns<OportunidadeDaRepresentada[]>();
  if (error) throw erroBanco(error);
  return data;
}
