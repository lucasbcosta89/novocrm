import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone } from "@/components/icones";
import { ImportacaoPlanilha } from "@/components/importacao-planilha";
import { carregar } from "@/server/acao";
import { podeImportar } from "@/server/importacao";

/** Fase 22 — cadastro de devoluções com Excel (componente genérico: prévia com o resumo antes de gravar). */
export default async function ImportarDevolucoesPage() {
  if (!(await carregar((ctx) => podeImportar(ctx)))) notFound();
  return (
    <>
      <p className="trilha"><Link href="/app/comissoes">Comissões</Link> / <Link href="/app/comissoes?visao=devolucoes">Devoluções</Link> /</p>
      <h1 className="titulo-icone"><Icone nome="arquivo" tamanho={24} /> Cadastrar devoluções com Excel</h1>
      <ImportacaoPlanilha entidade="devolucoes" voltar="/app/comissoes?visao=devolucoes" />
    </>
  );
}
