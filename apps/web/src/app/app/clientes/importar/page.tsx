import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone } from "@/components/icones";
import { ImportacaoPlanilha } from "@/components/importacao-planilha";
import { carregar } from "@/server/acao";
import { podeImportar } from "@/server/importacao";

/** Cadastro de clientes com Excel (componente genérico de importação + configuração de clientes). */
export default async function ImportarClientesPage() {
  // sem permissão de escrita a rota fica indisponível
  if (!(await carregar((ctx) => podeImportar(ctx)))) notFound();
  return (
    <>
      <p className="trilha"><Link href="/app/clientes">Clientes</Link> /</p>
      <h1 className="titulo-icone"><Icone nome="arquivo" tamanho={24} /> Cadastrar clientes com Excel</h1>
      <ImportacaoPlanilha entidade="clientes" voltar="/app/clientes" />
    </>
  );
}
