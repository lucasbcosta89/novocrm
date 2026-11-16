import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportacaoPlanilha } from "@/components/importacao-planilha";
import { carregar } from "@/server/acao";
import { podeImportar } from "@/server/importacao";

/**
 * Cadastro de devoluções com Excel, na página do cliente (componente genérico: prévia com o resumo antes de gravar).
 * Cada linha é identificada pelo Código do Pedido; a planilha pode trazer devoluções de mais de um cliente.
 */
export default async function ImportarDevolucoesClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await carregar((ctx) => podeImportar(ctx)))) notFound();
  const voltar = `/app/clientes/${id}/devolucoes`;
  return (
    <>
      <p className="trilha"><Link href={voltar}>Devoluções</Link> /</p>
      <h2 className="titulo-icone">Cadastrar Devoluções com Excel</h2>
      <p className="dica">Cada linha é ligada ao pedido pelo Código do Pedido (a planilha pode ter devoluções de outros clientes). A comissão negativa entra em Comissões na Data de Processamento.</p>
      <ImportacaoPlanilha entidade="devolucoes" voltar={voltar} />
    </>
  );
}
