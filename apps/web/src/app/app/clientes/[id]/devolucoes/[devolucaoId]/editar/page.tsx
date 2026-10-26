import { notFound } from "next/navigation";
import { Mensagens, type Busca } from "@/components/form";
import { Icone } from "@/components/icones";
import { StatusDevolucao } from "@/components/status";
import { carregar } from "@/server/acao";
import { obterCliente } from "@/server/clientes";
import { obterDevolucao } from "@/server/devolucoes";
import { FormDevolucao } from "../../formulario";

export default async function EditarDevolucaoPage({ params, searchParams }: { params: Promise<{ id: string; devolucaoId: string }>; searchParams: Busca }) {
  const [{ id, devolucaoId }, { erro }] = await Promise.all([params, searchParams]);
  const [c, d] = await carregar((ctx) => Promise.all([obterCliente(ctx, id), obterDevolucao(ctx, devolucaoId)]));
  if (d.cliente_id !== c.id) notFound();
  return (
    <>
      <h2 className="titulo-icone"><Icone nome="historico" tamanho={20} /> Editar devolução {d.numero} <StatusDevolucao status={d.status} /></h2>
      <Mensagens erro={erro} />
      <FormDevolucao cliente={c} devolucao={d} />
    </>
  );
}
