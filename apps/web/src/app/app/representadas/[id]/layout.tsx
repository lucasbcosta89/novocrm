import Link from "next/link";
import { Abas } from "@/components/abas";
import { Icone } from "@/components/icones";
import { carregar } from "@/server/acao";
import { obterRepresentada } from "@/server/representadas";

/** Nome da empresa no topo + menu superior persistente (cada aba é uma subpágina). */
export default async function RepresentadaLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await carregar((ctx) => obterRepresentada(ctx, id));
  return (
    <>
      <p className="trilha"><Link href="/app/representadas">Representadas</Link> /</p>
      <h1 className="titulo-icone"><Icone nome="predio" tamanho={24} /> {r.nome}</h1>
      <Abas
        base={`/app/representadas/${r.id}`}
        abas={[
          { href: "", rotulo: "Início", icone: "painel" },
          { href: "catalogo", rotulo: "Catálogo", icone: "pacote" },
          { href: "precos", rotulo: "Tabela de preços", icone: "etiqueta" },
          { href: "pedidos", rotulo: "Pedidos", icone: "carrinho" },
          { href: "oportunidades", rotulo: "Oportunidades", icone: "funil" },
        ]}
      />
      {children}
    </>
  );
}
