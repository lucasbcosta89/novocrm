import Link from "next/link";
import { Mensagens, type Busca } from "@/components/form";
import { formatarData } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { listarTarefasPendentes } from "@/server/consultas";
import { concluirTarefaAction, followUpAction } from "./whatsapp-actions";

export default async function Dashboard({ searchParams }: { searchParams: Busca }) {
  const [{ erro, ok }, tarefas] = await Promise.all([searchParams, carregar(listarTarefasPendentes)]);

  return (
    <>
      <h1>Dashboard</h1>
      <Mensagens erro={erro} ok={ok} />

      <section className="card">
        <h2>Follow-ups e tarefas</h2>
        <p className="dica">Visitas sem retorno há 15 dias geram um follow-up automático (todo dia às 6h).</p>
        {tarefas.length === 0 ? (
          <div className="vazio">Nenhuma tarefa pendente.</div>
        ) : (
          <ul className="lista">
            {tarefas.map((t) => (
              <li key={t.id}>
                <span>
                  {t.cliente ? <Link href={`/app/clientes/${t.cliente.id}`}>{t.titulo}</Link> : t.titulo}
                  {t.data && <span className="dica"> · {formatarData(`${t.data}T12:00:00Z`)}</span>}
                </span>
                <span className="acoes-linha">
                  {t.tipo === "follow_up_whatsapp" && (
                    <form action={followUpAction.bind(null, t.id)}>
                      <button className="btn btn-peq" type="submit">Enviar via WhatsApp</button>
                    </form>
                  )}
                  <form action={concluirTarefaAction.bind(null, t.id)}>
                    <button className="btn-link" type="submit">Concluir</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
