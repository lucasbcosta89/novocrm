import { z } from "zod";

/** Calendário (Fase 4e): agregação de visitas, sub-tarefas (plano_acao) e tarefas — sem tabela própria. */
export const TIPOS_EVENTO = ["visita", "subtarefa", "tarefa"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const ROTULO_TIPO_EVENTO: Record<TipoEvento, string> = { visita: "Visita", subtarefa: "Sub-tarefa", tarefa: "Tarefa" };
export const ROTULO_FILTRO_EVENTO: Record<TipoEvento, string> = { visita: "Visitas", subtarefa: "Sub-tarefas", tarefa: "Tarefas" };

export type Evento = {
  id: string;
  tipo: TipoEvento;
  titulo: string;
  /** visita: data/hora ISO; sub-tarefa e tarefa: AAAA-MM-DD (dia inteiro) */
  data: string;
  dia_inteiro: boolean;
  concluida: boolean;
  cancelada: boolean;
  cliente_nome: string | null;
  representada_nome: string | null;
  oportunidade_titulo?: string | null;
  /** id da oportunidade (sub-tarefa): abre o detalhe da Fase 4c no próprio calendário */
  oportunidade_id?: string | null;
  rota_edicao: string;
};

export const FUSO = "America/Sao_Paulo";
/** Dia (AAAA-MM-DD) de um instante no fuso de Brasília. */
export const diaSP = (d: Date | string) => new Date(d).toLocaleDateString("sv-SE", { timeZone: FUSO });

/** Faixa vermelha: data já passou e o item não está concluído nem cancelado. */
export function eventoAtrasado(e: Pick<Evento, "data" | "dia_inteiro" | "concluida" | "cancelada">, agora: Date = new Date()): boolean {
  if (e.concluida || e.cancelada) return false;
  return e.dia_inteiro ? e.data < diaSP(agora) : new Date(e.data).getTime() < agora.getTime();
}

const dataIso = z.iso.date("Data inválida (use AAAA-MM-DD)");

export const calendarioQuerySchema = z
  .object({
    inicio: dataIso,
    fim: dataIso,
    tipos: z.preprocess(
      (v) => (typeof v === "string" && v ? v.split(",").map((t) => t.trim()) : [...TIPOS_EVENTO]),
      z.array(z.enum(TIPOS_EVENTO, "Tipo de evento inválido")).min(1),
    ),
  })
  .refine((q) => q.fim >= q.inicio, { message: "Fim antes do início", path: ["fim"] })
  .refine((q) => (Date.parse(q.fim) - Date.parse(q.inicio)) / 86_400_000 <= 100, { message: "Intervalo máximo de 100 dias", path: ["fim"] });

/** Reagendar pelo arraste: visita recebe data/hora ISO; sub-tarefa e tarefa recebem AAAA-MM-DD. */
export const reagendarSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("visita"), id: z.uuid("Evento inválido"), data: z.iso.datetime({ offset: true, message: "Data/hora inválida" }) }),
  z.object({ tipo: z.literal("subtarefa"), id: z.uuid("Evento inválido"), data: dataIso }),
  z.object({ tipo: z.literal("tarefa"), id: z.uuid("Evento inválido"), data: dataIso }),
]);
