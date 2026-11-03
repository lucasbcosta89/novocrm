import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone } from "@/components/icones";
import { ImportacaoPlanilha } from "@/components/importacao-planilha";
import { carregar } from "@/server/acao";
import { podeImportar } from "@/server/importacao";

/** Importação de representadas por planilha (componente genérico + configuração de representadas). */
export default async function ImportarRepresentadasPage() {
  // sem permissão de escrita a rota fica indisponível
  if (!(await carregar((ctx) => podeImportar(ctx)))) notFound();
  return (
    <>
      <p className="trilha"><Link href="/app/representadas">Representadas</Link> /</p>
      <h1 className="titulo-icone"><Icone nome="arquivo" tamanho={24} /> Importar representadas</h1>
      <ImportacaoPlanilha entidade="representadas" voltar="/app/representadas" />
    </>
  );
}
