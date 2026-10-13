import Link from "next/link";
import { Abas } from "@/components/abas";
import { carregar } from "@/server/acao";
import { obterRepresentada } from "@/server/representadas";

/** Nome da empresa no topo + menu superior persistente (cada aba é uma subpágina). */
export default async function RepresentadaLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await carregar((ctx) => obterRepresentada(ctx, id));
  return (
    <>
      <p className="trilha"><Link href="/app/representadas">Representadas</Link> /</p>
      <h1>{r.nome}</h1>
      <Abas
        base={`/app/representadas/${r.id}`}
        abas={[
          { href: "", rotulo: "Início" },
          { href: "catalogo", rotulo: "Catálogo" },
          { href: "precos", rotulo: "Tabela de preços" },
          { href: "pedidos", rotulo: "Pedidos" },
          { href: "oportunidades", rotulo: "Oportunidades" },
        ]}
      />
      {children}
    </>
  );
}
