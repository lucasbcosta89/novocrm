import Link from "next/link";
import { Abas } from "@/components/abas";
import { Avatar } from "@/components/avatar";
import { Icone } from "@/components/icones";
import { carregar } from "@/server/acao";
import { obterCliente } from "@/server/clientes";

/** Nome do cliente no topo + menu superior persistente (cada aba é uma subpágina). */
export default async function ClienteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await carregar((ctx) => obterCliente(ctx, id));
  return (
    <>
      <p className="trilha"><Link href="/app/clientes">Clientes</Link> /</p>
      <h1 className="titulo-icone"><Avatar nome={c.nome} /> {c.nome}</h1>
      <Abas
        base={`/app/clientes/${c.id}`}
        abas={[
          { href: "", rotulo: "Início", icone: "painel" },
          { href: "visitas", rotulo: "Visitas", icone: "calendario" },
          { href: "pedidos", rotulo: "Pedidos", icone: "carrinho" },
          { href: "devolucoes", rotulo: "Devoluções", icone: "historico" },
          { href: "oportunidades", rotulo: "Oportunidades", icone: "funil" },
          { href: "representadas", rotulo: "Representadas", icone: "predio" },
        ]}
      />
      {!c.documento && (
        <p className="aviso aviso-erro" role="alert">
          <span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>
          Cadastro incompleto: o CNPJ/CPF é obrigatório. <Link href={`/app/clientes/${c.id}#editar`}>Preencha em “Editar dados”</Link>.
        </p>
      )}
      {c.representadas.length === 0 && (
        <p className="aviso aviso-alerta">
          <span className="circulo-icone"><Icone nome="predio" tamanho={16} /></span>
          Cliente sem representada vinculada. <Link href={`/app/clientes/${c.id}/representadas`}>Vincule na aba Representadas</Link>.
        </p>
      )}
      {children}
    </>
  );
}
