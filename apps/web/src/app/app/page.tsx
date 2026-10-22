import Link from "next/link";
import { Suspense } from "react";
import { Mensagens, type Busca } from "@/components/form";
import { Icone } from "@/components/icones";
import { formatarData } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { listarTarefasPendentes } from "@/server/consultas";
import { listarRepresentadas } from "@/server/representadas";
import { PainelPrincipal } from "./dashboard/painel-principal";
import { concluirTarefaAction, followUpAction } from "./whatsapp-actions";

/** Home: dashboard principal (dados via /api/dashboard) + follow-ups e tarefas pendentes com ações. */
export default async function Dashboard({ searchParams }: { searchParams: Busca }) {
  const [{ erro, ok }, [tarefas, representadas]] = await Promise.all([
    searchParams,
    carregar((ctx) => Promise.all([listarTarefasPendentes(ctx), listarRepresentadas(ctx)])),
  ]);

  const agora = new Date();
  const hoje = agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
  const dataExtenso = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" })
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <>
      <Mensagens erro={erro} ok={ok} />
      <Suspense>
        <PainelPrincipal representadas={representadas.map((r) => ({ id: r.id, nome: r.nome }))} dataExtenso={dataExtenso} />
      </Suspense>

      <section className="card" id="tarefas">
        <div className="cabecalho">
          <h2 className="titulo-icone"><Icone nome="sino" tamanho={20} /> Follow-ups e tarefas pendentes</h2>
          <Link className="btn-suave btn-peq" href="/app/pedidos/novo"><Icone nome="mais" tamanho={16} /> Novo pedido</Link>
        </div>
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
                  <span className={`circulo-icone ${atrasada ? "tom-perigo" : "tom-azul"}`}>
                    <Icone nome={atrasada ? "alerta" : t.tipo === "follow_up_whatsapp" ? "whatsapp" : "relogio"} tamanho={16} />
                  </span>
                  <span className="item-titulo">
                    {t.cliente ? <Link href={`/app/clientes/${t.cliente.id}`}>{t.titulo}</Link> : <span>{t.titulo}</span>}
                    {t.data && (
                      <span className={atrasada ? "item-sub atrasada" : "item-sub"}>
                        {atrasada ? "Atrasada · " : ""}{formatarData(`${t.data}T12:00:00Z`)}
                      </span>
                    )}
                  </span>
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
