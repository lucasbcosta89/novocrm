import { Icone } from "@/components/icones";
import { carregar } from "@/server/acao";
import { listarRepresentadas } from "@/server/representadas";
import { CalendarioAtividades } from "./calendario";

/** Calendário: agenda unificada (visitas, sub-tarefas de oportunidades e tarefas), lida via /api/calendario. */
export default async function CalendarioPage() {
  const representadas = await carregar(listarRepresentadas);
  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1 className="titulo-icone"><Icone nome="calendario" tamanho={24} /> Calendário</h1>
          <p className="subtitulo">Visitas, sub-tarefas de oportunidades e tarefas num só lugar.</p>
        </div>
      </div>
      <CalendarioAtividades representadas={representadas.map((r) => ({ id: r.id, nome: r.nome }))} />
    </>
  );
}
