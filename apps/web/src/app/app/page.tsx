import Link from "next/link";
import { Mensagens, type Busca } from "@/components/form";
import { Icone } from "@/components/icones";
import { formatarData } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { listarTarefasPendentes } from "@/server/consultas";
import { concluirTarefaAction, followUpAction } from "./whatsapp-actions";

export default async function Dashboard({ searchParams }: { searchParams: Busca }) {
  const [{ erro, ok }, tarefas] = await Promise.all([searchParams, carregar(listarTarefasPendentes)]);

  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD

  return (
    <>
      <h1 className="titulo-icone"><Icone nome="painel" tamanho={24} /> Dashboard</h1>
      <Mensagens erro={erro} ok={ok} />

      <section className="card">
        <h2 className="titulo-icone"><Icone nome="sino" tamanho={20} /> Follow-ups e tarefas</h2>
        <p className="dica">Visitas sem retorno há 15 dias geram um follow-up automático (todo dia às 6h).</p>
        {tarefas.length === 0 ? (
          <div className="vazio">Nenhuma tarefa pendente.</div>
        ) : (
          <ul className="lista">
            {tarefas.map((t) => {
              const atrasada = !!t.data && t.data < hoje;
              return (
              <li key={t.id} className={atrasada ? "item-atrasado" : undefined}>
                <span className="item-icone">
                  {atrasada ? (
                    <span className="txt-perigo com-dica" data-dica="Atrasada" aria-label="Atrasada" role="img"><Icone nome="alerta" /></span>
                  ) : (
                    <Icone nome={t.tipo === "follow_up_whatsapp" ? "whatsapp" : "relogio"} />
                  )}
                  {t.cliente ? <Link href={`/app/clientes/${t.cliente.id}`}>{t.titulo}</Link> : t.titulo}
                  {t.data && <span className="dica"> · {formatarData(`${t.data}T12:00:00Z`)}</span>}
                </span>
                <span className="acoes-linha">
                  {t.tipo === "follow_up_whatsapp" && (
                    <form action={followUpAction.bind(null, t.id)}>
                      <button className="btn btn-peq btn-whatsapp" type="submit"><Icone nome="whatsapp" tamanho={16} /> Enviar via WhatsApp</button>
                    </form>
                  )}
                  <form action={concluirTarefaAction.bind(null, t.id)}>
                    <button className="btn-link" type="submit"><Icone nome="check" tamanho={16} /> Concluir</button>
                  </form>
                </span>
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
