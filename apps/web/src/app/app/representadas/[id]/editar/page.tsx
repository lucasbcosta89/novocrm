import { BotaoConfirmar } from "@/components/botao-confirmar";
import { Icone } from "@/components/icones";
import { valoresDaRepresentada } from "@/lib/cadastros/representada";
import { carregar } from "@/server/acao";
import { obterRepresentada } from "@/server/representadas";
import { excluirRepresentadaAction, salvarRepresentadaAction } from "../../actions";
import { FormularioRepresentada } from "../../formulario";

/** Edição da representada: carrega o registro; exclusão é lógica (sai da lista, histórico preservado). */
export default async function EditarRepresentadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await carregar((ctx) => obterRepresentada(ctx, id));
  if (r.excluido_em) {
    return <p className="aviso aviso-alerta"><span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>Representada excluída: os dados ficam só no histórico.</p>;
  }
  return (
    <>
      <section className="card">
        <h2 className="titulo-icone"><Icone nome="lapis" tamanho={20} /> Editar dados</h2>
        <FormularioRepresentada
          edicao
          acao={salvarRepresentadaAction.bind(null, r.id)}
          iniciais={valoresDaRepresentada(r)}
          catalogo={{ publico: r.catalogo_publico, pedidos: r.criar_pedido_publico }}
          cancelar={`/app/representadas/${r.id}`}
        />
      </section>
      <section className="card">
        <h2 className="titulo-icone"><Icone nome="lixeira" tamanho={20} /> Excluir representada</h2>
        <p className="dica">A exclusão é lógica: a representada sai da lista e libera a vaga do plano; pedidos, comissões e clientes vinculados continuam no histórico. Para só tirar dos novos pedidos, use o status Inativa.</p>
        <form action={excluirRepresentadaAction.bind(null, r.id)}>
          <BotaoConfirmar className="btn-perigo" texto="Excluir representada" pergunta={`Excluir "${r.razao_social}"? Ela sai da lista; o histórico continua.`} />
        </form>
      </section>
    </>
  );
}
