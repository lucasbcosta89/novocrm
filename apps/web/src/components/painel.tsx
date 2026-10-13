import Link from "next/link";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato";
import type { Painel } from "@/server/dashboards";

/** Dashboard da página inicial (representada/cliente): vendas, visitas e alertas dos próximos 7 dias. */
export function PainelResumo({ painel, rotuloVisitas }: { painel: Painel; rotuloVisitas: string }) {
  return (
    <>
      <section className="card">
        <dl className="resumo painel">
          <div><dt>Vendas (total)</dt><dd>{formatarMoeda(painel.vendasTotal)}</dd></div>
          <div><dt>Vendas no mês</dt><dd>{formatarMoeda(painel.vendasMes)}</dd></div>
          <div><dt>Pedidos</dt><dd>{painel.pedidos}</dd></div>
          <div><dt>{rotuloVisitas}</dt><dd>{painel.visitas}</dd></div>
        </dl>
        <p className="dica">Vendas = pedidos confirmados ou entregues.</p>
      </section>

      <section className="card">
        <h2>Alertas — próximos 7 dias</h2>
        {painel.alertas.length === 0 ? (
          <p className="dica">Nenhuma tarefa ou visita agendada para os próximos 7 dias.</p>
        ) : (
          <ul className="lista alertas">
            {painel.alertas.map((a) => (
              <li key={`${a.tipo}-${a.id}`}>
                <Link href={a.href}>
                  <span className={`etiqueta ${a.tipo === "tarefa" ? "etiqueta-a_receber" : "etiqueta-oportunidade"}`}>{a.tipo === "tarefa" ? "Tarefa" : "Visita"}</span>{" "}
                  {a.titulo}
                </Link>
                <span className="dica">{a.tipo === "tarefa" ? formatarData(a.data) : formatarDataHora(a.data)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
