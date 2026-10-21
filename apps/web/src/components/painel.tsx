import Link from "next/link";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato";
import type { Painel } from "@/server/dashboards";
import { Icone, type NomeIcone } from "./icones";

function Kpi({ icone, tom, rotulo, valor }: { icone: NomeIcone; tom: string; rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="kpi">
      <span className={`kpi-icone ${tom}`}><Icone nome={icone} tamanho={20} /></span>
      <div><dt>{rotulo}</dt><dd>{valor}</dd></div>
    </div>
  );
}

/** Dashboard da página inicial (representada/cliente): vendas, visitas e alertas dos próximos 7 dias. */
export function PainelResumo({ painel, rotuloVisitas }: { painel: Painel; rotuloVisitas: string }) {
  return (
    <>
      <section className="card">
        <dl className="kpis">
          <Kpi icone="cifrao" tom="tom-azul" rotulo="Vendas (total)" valor={formatarMoeda(painel.vendasTotal)} />
          <Kpi icone="tendencia" tom="tom-violeta" rotulo="Vendas no mês" valor={formatarMoeda(painel.vendasMes)} />
          <Kpi icone="carrinho" tom="tom-ciano" rotulo="Pedidos" valor={painel.pedidos} />
          <Kpi icone="calendario" tom="tom-rosa" rotulo={rotuloVisitas} valor={painel.visitas} />
        </dl>
        <p className="dica">Vendas = pedidos confirmados ou entregues.</p>
      </section>

      <section className="card">
        <h2 className="titulo-icone"><Icone nome="sino" tamanho={20} /> Alertas — próximos 7 dias</h2>
        {painel.alertas.length === 0 ? (
          <p className="dica">Nenhuma tarefa ou visita agendada para os próximos 7 dias.</p>
        ) : (
          <ul className="lista alertas">
            {painel.alertas.map((a) => (
              <li key={`${a.tipo}-${a.id}`}>
                <Link href={a.href}>
                  <Icone nome={a.tipo === "tarefa" ? "relogio" : "calendario"} tamanho={16} />{" "}
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
