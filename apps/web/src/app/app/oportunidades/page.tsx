import Link from "next/link";
import { Mensagens } from "@/components/form";
import { Icone } from "@/components/icones";
import { ROTULO_MODELO_FUNIL } from "@/lib/funis";
import { resumoOportunidades } from "@/lib/oportunidades";
import { carregar } from "@/server/acao";
import { listarFunis, listarResultados } from "@/server/funis";
import { CriarFunil } from "./criar-funil";
import { FiltroFunil } from "./filtro-funil";

/** Início das oportunidades: funis (com oportunidades em aberto) e log de ganhas/perdidas filtrável por funil. */
export default async function OportunidadesInicio({
  searchParams,
}: {
  searchParams: Promise<{ funil?: string; erro?: string; ok?: string }>;
}) {
  const { funil, erro, ok } = await searchParams;
  const [funis, resultados] = await carregar((ctx) => Promise.all([listarFunis(ctx), listarResultados(ctx)]));
  const filtro = funis.some((f) => f.id === funil) ? funil! : "";
  const resumo = resumoOportunidades(filtro ? resultados.filter((r) => r.funil_id === filtro) : resultados);

  return (
    <>
      <Mensagens erro={erro} ok={ok} />

      {funis.length === 0 ? (
        <section className="card">
          <div className="cabecalho">
            <h2 className="titulo-icone"><Icone nome="funil" tamanho={20} /> Funis de vendas</h2>
            <CriarFunil />
          </div>
          <div className="vazio">Você ainda não criou nenhum funil</div>
        </section>
      ) : (
        <section className="card">
          <h2 className="titulo-icone"><Icone nome="funil" tamanho={20} /> Funis de vendas</h2>
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Funil</th><th>Modelo</th><th>Etapas</th><th className="num">Oportunidades em aberto</th></tr>
              </thead>
              <tbody>
                {funis.map((f) => (
                  <tr key={f.id}>
                    <td><Link href={`/app/oportunidades/funis/${f.id}`}>{f.nome}</Link></td>
                    <td><span className="etiqueta etiqueta-rascunho">{ROTULO_MODELO_FUNIL[f.modelo]}</span></td>
                    <td className="dica">{f.etapas.map((e) => e.nome).join(" → ")}</td>
                    <td className="num"><strong>{f.emAberto}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div><CriarFunil /></div>
        </section>
      )}

      <section className="card">
        <div className="cabecalho">
          <h2 className="titulo-icone"><Icone nome="grafico" tamanho={20} /> Log de oportunidades</h2>
          <FiltroFunil funis={funis.map((f) => ({ id: f.id, nome: f.nome }))} atual={filtro} />
        </div>
        <dl className="kpis">
          <div className="kpi"><span className="kpi-icone tom-azul"><Icone nome="documento" tamanho={20} /></span><div><dt>Total inseridas</dt><dd>{resumo.total}</dd></div></div>
          <div className="kpi"><span className="kpi-icone tom-ok"><Icone nome="concluido" tamanho={20} /></span><div><dt>Ganhas</dt><dd className="txt-ok">{resumo.ganhas}</dd></div></div>
          <div className="kpi"><span className="kpi-icone tom-perigo"><Icone nome="cancelado" tamanho={20} /></span><div><dt>Perdidas</dt><dd className="atrasada">{resumo.perdidas}</dd></div></div>
          <div className="kpi"><span className="kpi-icone tom-violeta"><Icone nome="tendencia" tamanho={20} /></span><div><dt>Aproveitamento</dt><dd>{String(resumo.aproveitamento).replace(".", ",")}%</dd></div></div>
        </dl>
        <p className="dica">Aproveitamento = ganhas ÷ (ganhas + perdidas) × 100. Inclui oportunidades arquivadas.</p>
      </section>
    </>
  );
}
