import Link from "next/link";
import { Icone } from "@/components/icones";
import { AvisoLimite } from "@/components/limite";
import { carregar } from "@/server/acao";
import { obterUso } from "@/server/quota";
import { salvarRepresentadaAction } from "../actions";
import { FormularioRepresentada } from "../formulario";

/** Nova representada: formulário por seções, com "Salvar e adicionar outra". */
export default async function NovaRepresentadaPage() {
  const uso = await carregar((ctx) => obterUso(ctx));
  return (
    <>
      <p className="trilha"><Link href="/app/representadas">Representadas</Link> /</p>
      <h1 className="titulo-icone"><Icone nome="predio" tamanho={24} /> Nova representada</h1>
      <AvisoLimite uso={uso} recurso="representadas" />
      <section className="card">
        <FormularioRepresentada acao={salvarRepresentadaAction.bind(null, null)} cancelar="/app/representadas" />
      </section>
    </>
  );
}
