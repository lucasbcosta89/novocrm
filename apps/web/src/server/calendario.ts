import "server-only";
import { calendarioQuerySchema, reagendarSchema, type Evento } from "@/lib/calendario";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

type Nome = { nome: string } | null;
type VisitaRow = { id: string; data: string; cliente_id: string; cliente: Nome; representada: Nome };
type AcaoRow = {
  id: string; descricao: string; prazo: string; status: string;
  oportunidade: { id: string; titulo: string; cliente_id: string | null; funil_id: string | null; cliente: Nome; representada: Nome } | null;
};
type TarefaRow = { id: string; titulo: string; data: string; concluida: boolean; cliente_id: string | null; cliente: Nome; representada: Nome };

// Brasília está em UTC−3 o ano todo (sem horário de verão desde 2019)
const inicioDoDia = (dia: string) => `${dia}T00:00:00-03:00`;
const fimDoDia = (dia: string) => `${dia}T23:59:59.999-03:00`;

/**
 * Eventos do período: visitas, sub-tarefas (plano_acao.prazo) e tarefas, num formato único.
 * Só lê as tabelas de origem (RLS garante que são do usuário). Visitas não têm status no banco:
 * data passada = realizada; data futura = agendada.
 */
export async function listarEventos({ supabase }: Contexto, query: unknown): Promise<Evento[]> {
  const q = calendarioQuerySchema.parse(query);
  const quer = (t: string) => q.tipos.includes(t as never);
  const agora = Date.now();

  const [visitas, acoes, tarefas] = await Promise.all([
    quer("visita")
      ? supabase
          .from("visitas")
          .select("id, data, cliente_id, cliente:clientes(nome), representada:representadas(nome:razao_social)")
          .gte("data", inicioDoDia(q.inicio))
          .lte("data", fimDoDia(q.fim))
          .returns<VisitaRow[]>()
      : null,
    quer("subtarefa")
      ? supabase
          .from("plano_acao")
          .select("id, descricao, prazo, status, oportunidade:oportunidades_desafios(id, titulo, cliente_id, funil_id, cliente:clientes(nome), representada:representadas(nome:razao_social))")
          .gte("prazo", q.inicio)
          .lte("prazo", q.fim)
          .returns<AcaoRow[]>()
      : null,
    quer("tarefa")
      ? supabase
          .from("tarefas")
          .select("id, titulo, data, concluida, cliente_id, cliente:clientes(nome), representada:representadas(nome:razao_social)")
          .gte("data", q.inicio)
          .lte("data", q.fim)
          .returns<TarefaRow[]>()
      : null,
  ]);
  for (const r of [visitas, acoes, tarefas]) if (r?.error) throw erroBanco(r.error);

  const eventos: Evento[] = [];
  for (const v of visitas?.data ?? []) {
    eventos.push({
      id: v.id, tipo: "visita", titulo: `Visita ${v.cliente?.nome ?? ""}`.trim(), data: new Date(v.data).toISOString(), dia_inteiro: false,
      concluida: new Date(v.data).getTime() <= agora, cancelada: false,
      cliente_nome: v.cliente?.nome ?? null, representada_nome: v.representada?.nome ?? null,
      rota_edicao: `/app/clientes/${v.cliente_id}/visitas#visita-${v.id}`,
    });
  }
  for (const a of acoes?.data ?? []) {
    const o = a.oportunidade;
    eventos.push({
      id: a.id, tipo: "subtarefa", titulo: a.descricao, data: a.prazo, dia_inteiro: true,
      concluida: a.status === "concluido", cancelada: a.status === "cancelado",
      cliente_nome: o?.cliente?.nome ?? null, representada_nome: o?.representada?.nome ?? null,
      oportunidade_titulo: o?.titulo ?? null, oportunidade_id: o?.id ?? null,
      rota_edicao: o?.cliente_id ? `/app/clientes/${o.cliente_id}/oportunidades/${o.id}` : o?.funil_id ? `/app/oportunidades/funis/${o.funil_id}` : "/app/oportunidades",
    });
  }
  for (const t of tarefas?.data ?? []) {
    eventos.push({
      id: t.id, tipo: "tarefa", titulo: t.titulo, data: t.data, dia_inteiro: true,
      concluida: t.concluida, cancelada: false,
      cliente_nome: t.cliente?.nome ?? null, representada_nome: t.representada?.nome ?? null,
      rota_edicao: "/app",
    });
  }
  return eventos.sort((a, b) => a.data.localeCompare(b.data));
}

/** Arraste no calendário: grava a nova data na tabela de origem. */
export async function reagendarEvento({ supabase }: Contexto, input: unknown): Promise<void> {
  const r = reagendarSchema.parse(input);
  const alvo =
    r.tipo === "visita"
      ? supabase.from("visitas").update({ data: r.data, updated_at: new Date().toISOString() }, { count: "exact" })
      : r.tipo === "subtarefa"
        ? supabase.from("plano_acao").update({ prazo: r.data }, { count: "exact" })
        : supabase.from("tarefas").update({ data: r.data }, { count: "exact" });
  const { error, count } = await alvo.eq("id", r.id);
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Evento não encontrado", "nao_encontrado");
}
