import { redirect } from "next/navigation";
import { Icone } from "@/components/icones";
import { carregar } from "@/server/acao";
import { listarFunis } from "@/server/funis";
import { CriarFunil } from "../criar-funil";

/** Subpágina "Funis": abre o kanban do funil pedido (?funil=) ou do primeiro; sem funis, convida a criar. */
export default async function FunisPage({ searchParams }: { searchParams: Promise<{ funil?: string }> }) {
  const { funil } = await searchParams;
  const funis = await carregar(listarFunis);
  const alvo = funis.find((f) => f.id === funil) ?? funis[0];
  if (alvo) redirect(`/app/oportunidades/funis/${alvo.id}`);

  return (
    <section className="card">
      <div className="cabecalho">
        <h2 className="titulo-icone"><Icone nome="funil" tamanho={20} /> Funis de vendas</h2>
        <CriarFunil voltar="kanban" />
      </div>
      <div className="vazio">Você ainda não criou nenhum funil</div>
    </section>
  );
}
