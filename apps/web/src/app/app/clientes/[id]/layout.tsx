import Link from "next/link";
import { Abas } from "@/components/abas";
import { carregar } from "@/server/acao";
import { obterCliente } from "@/server/clientes";

/** Nome do cliente no topo + menu superior persistente (cada aba é uma subpágina). */
export default async function ClienteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await carregar((ctx) => obterCliente(ctx, id));
  return (
    <>
      <p className="trilha"><Link href="/app/clientes">Clientes</Link> /</p>
      <h1>{c.nome}</h1>
      <Abas
        base={`/app/clientes/${c.id}`}
        abas={[
          { href: "", rotulo: "Início" },
          { href: "visitas", rotulo: "Visitas" },
          { href: "pedidos", rotulo: "Pedidos" },
          { href: "oportunidades", rotulo: "Oportunidades" },
          { href: "representadas", rotulo: "Representadas" },
        ]}
      />
      {children}
    </>
  );
}
