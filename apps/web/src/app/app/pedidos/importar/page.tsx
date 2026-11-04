import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone } from "@/components/icones";
import { ImportacaoPlanilha } from "@/components/importacao-planilha";
import { carregar } from "@/server/acao";
import { podeImportar } from "@/server/importacao";

/** Cadastro de pedidos com Excel (componente genérico de importação + configuração de pedidos). */
export default async function ImportarPedidosPage() {
  // sem permissão de escrita a rota fica indisponível
  if (!(await carregar((ctx) => podeImportar(ctx)))) notFound();
  return (
    <>
      <p className="trilha"><Link href="/app/pedidos">Pedidos</Link> /</p>
      <h1 className="titulo-icone"><Icone nome="arquivo" tamanho={24} /> Cadastrar pedidos com Excel</h1>
      <ImportacaoPlanilha entidade="pedidos" voltar="/app/pedidos" />
    </>
  );
}
