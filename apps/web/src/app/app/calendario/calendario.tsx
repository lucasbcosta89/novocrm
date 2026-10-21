"use client";

import { addHours, endOfMonth, endOfWeek, format, getDay, parse, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import withDragAndDrop, { type EventInteractionArgs } from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { Icone } from "@/components/icones";
import { eventoAtrasado, ROTULO_FILTRO_EVENTO, ROTULO_TIPO_EVENTO, TIPOS_EVENTO, type Evento, type TipoEvento } from "@/lib/calendario";
import { api } from "../oportunidades/comum";
import { DetalheOportunidade } from "../oportunidades/detalhe";

type ItemCalendario = { id: string; title: string; start: Date; end: Date; allDay: boolean; ev: Evento };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { locale: ptBR }),
  getDay,
  locales: { "pt-BR": ptBR },
});
const DnDCalendar = withDragAndDrop<ItemCalendario>(Calendar);

const MENSAGENS = {
  today: "Hoje", previous: "Anterior", next: "Próximo", month: "Mês", week: "Semana", day: "Dia", agenda: "Agenda",
  date: "Data", time: "Hora", event: "Atividade", allDay: "Dia todo", noEventsInRange: "Nenhuma atividade neste período.",
  showMore: (n: number) => `+${n} mais`,
};

/** "AAAA-MM-DD" → meia-noite local (eventos de dia inteiro). */
const diaLocal = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a!, m! - 1, d!);
};

function paraItem(ev: Evento): ItemCalendario {
  const start = ev.dia_inteiro ? diaLocal(ev.data) : new Date(ev.data);
  return { id: `${ev.tipo}:${ev.id}`, title: ev.titulo, start, end: ev.dia_inteiro ? start : addHours(start, 1), allDay: ev.dia_inteiro, ev };
}

function intervalo(data: Date, view: View) {
  const ini = view === "week" ? startOfWeek(data, { locale: ptBR }) : startOfWeek(startOfMonth(data), { locale: ptBR });
  const fim = view === "week" ? endOfWeek(data, { locale: ptBR }) : endOfWeek(endOfMonth(data), { locale: ptBR });
  return { inicio: format(ini, "yyyy-MM-dd"), fim: format(fim, "yyyy-MM-dd") };
}

function ChipEvento({ event }: { event: ItemCalendario }) {
  const e = event.ev;
  const detalhe = [e.cliente_nome, e.oportunidade_titulo, e.representada_nome].filter(Boolean).join(" · ");
  return (
    <span className="ev-conteudo" title={`${ROTULO_TIPO_EVENTO[e.tipo]}: ${e.titulo}${detalhe ? ` — ${detalhe}` : ""}`}>
      <span className="ev-tipo">{ROTULO_TIPO_EVENTO[e.tipo]}</span>
      <span className="ev-titulo">{e.titulo}</span>
    </span>
  );
}

/**
 * Agenda unificada (visitas, sub-tarefas e tarefas): visões mensal e semanal, filtro por tipo,
 * arrastar para reagendar (grava na origem) e clique para editar o item.
 */
export function CalendarioAtividades({ representadas }: { representadas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>("month");
  const [data, setData] = useState(() => new Date());
  const [filtro, setFiltro] = useState<TipoEvento | "">("");
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const { inicio, fim } = intervalo(data, view);
  const tipos = filtro ? filtro : TIPOS_EVENTO.join(",");

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/calendario?inicio=${inicio}&fim=${fim}&tipos=${tipos}`, { signal: ctrl.signal })
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro ?? "Falha ao carregar o calendário");
        setEventos(corpo as Evento[]);
        setErro(null);
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setErro(e instanceof Error ? e.message : "Falha ao carregar o calendário");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCarregando(false);
      });
    return () => ctrl.abort();
  }, [inicio, fim, tipos, versao]);

  const itens = useMemo(() => eventos.map(paraItem), [eventos]);

  /** Arrastar para outro dia: atualiza na hora e grava na origem; desfaz se falhar. */
  const mover = useCallback(
    async ({ event, start }: EventInteractionArgs<ItemCalendario>) => {
      const novo = new Date(start);
      const ev = event.ev;
      let dataNova: string;
      if (ev.tipo === "visita") {
        // na visão mensal o arraste muda só o dia: mantém o horário da visita
        if (view === "month" || event.allDay) novo.setHours(event.start.getHours(), event.start.getMinutes(), 0, 0);
        dataNova = novo.toISOString();
      } else {
        dataNova = format(novo, "yyyy-MM-dd");
      }
      if (dataNova === ev.data) return;
      const anterior = eventos;
      setErro(null);
      setEventos((xs) => xs.map((x) => (x.tipo === ev.tipo && x.id === ev.id ? { ...x, data: dataNova } : x)));
      try {
        await api("/api/calendario", { method: "PATCH", body: JSON.stringify({ tipo: ev.tipo, id: ev.id, data: dataNova }) });
        if (ev.tipo === "visita") setVersao((v) => v + 1); // recalcula realizada/agendada pela nova data
      } catch (e) {
        setEventos(anterior);
        setErro(e instanceof Error ? e.message : "Falha ao reagendar");
      }
    },
    [eventos, view],
  );

  function abrir(item: ItemCalendario) {
    const ev = item.ev;
    if (ev.tipo === "subtarefa" && ev.oportunidade_id) setDetalhe(ev.oportunidade_id);
    else router.push(ev.rota_edicao);
  }

  return (
    <>
      <div className="card calendario-topo">
        <div className="filtro-tipos" role="group" aria-label="Filtrar por tipo">
          {(["", ...TIPOS_EVENTO] as const).map((t) => (
            <button
              key={t || "todos"}
              type="button"
              className={`chip-filtro ${t ? `chip-${t}` : ""} ${filtro === t ? "ativo" : ""}`}
              aria-pressed={filtro === t}
              onClick={() => setFiltro(t)}
            >
              {t ? ROTULO_FILTRO_EVENTO[t] : "Todos"}
            </button>
          ))}
        </div>
        <p className="dica legenda-calendario">
          <span className="com-icone"><Icone nome="alerta" tamanho={14} /> Faixa vermelha = data passada e não concluído</span>
          {" · "}Arraste para reagendar; clique para editar.
        </p>
      </div>
      {erro && <p className="aviso aviso-erro" role="alert">{erro}</p>}

      <section className={`card calendario ${carregando ? "carregando" : ""}`}>
        <DnDCalendar
          localizer={localizer}
          culture="pt-BR"
          messages={MENSAGENS}
          events={itens}
          views={["month", "week"]}
          view={view}
          onView={setView}
          date={data}
          onNavigate={setData}
          startAccessor="start"
          endAccessor="end"
          allDayAccessor="allDay"
          popup
          resizable={false}
          draggableAccessor={() => true}
          onEventDrop={mover}
          onSelectEvent={abrir}
          scrollToTime={new Date(1970, 0, 1, 7)}
          eventPropGetter={(item) => ({
            className: `ev ev-${item.ev.tipo}${eventoAtrasado(item.ev) ? " ev-atrasado" : ""}${item.ev.concluida || item.ev.cancelada ? " ev-concluido" : ""}`,
          })}
          components={{ event: ChipEvento }}
          style={{ minHeight: 640 }}
        />
      </section>

      {detalhe && (
        <DetalheOportunidade
          id={detalhe}
          representadas={representadas}
          onFechar={() => {
            setDetalhe(null);
            setVersao((v) => v + 1);
          }}
          onAtualizada={() => setVersao((v) => v + 1)}
          onExcluida={() => {
            setDetalhe(null);
            setVersao((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
