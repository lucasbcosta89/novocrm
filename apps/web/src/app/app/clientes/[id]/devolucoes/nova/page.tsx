import { Mensagens } from "@/components/form";
import { Icone } from "@/components/icones";
import { carregar } from "@/server/acao";
import { obterCliente } from "@/server/clientes";
import { FormDevolucao } from "../formulario";

export default async function NovaDevolucaoPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ representada?: string; pedido?: string; erro?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await carregar((ctx) => obterCliente(ctx, id));
  return (
    <>
      <h2 className="titulo-icone"><Icone nome="historico" tamanho={20} /> Registrar devolução</h2>
      <Mensagens erro={sp.erro} />
      <FormDevolucao cliente={c} representadaId={sp.representada} pedidoId={sp.pedido} />
    </>
  );
}
