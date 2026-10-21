import { carregar } from "@/server/acao";
import { listarTabelaPrecos } from "@/server/consultas";
import { TabelaPrecosEditavel } from "./tabela-editavel";

export default async function RepresentadaPrecos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const precos = await carregar((ctx) => listarTabelaPrecos(ctx, id));
  return (
    <section className="card">
      {/* key: recarrega o estado da planilha quando os dados do servidor mudam */}
      <TabelaPrecosEditavel key={precos.map((p) => `${p.id}:${p.preco}:${p.desconto_max}`).join("|")} representadaId={id} precos={precos} />
    </section>
  );
}
