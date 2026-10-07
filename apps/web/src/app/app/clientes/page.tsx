import Link from "next/link";
import { Mensagens, type Busca } from "@/components/form";
import { formatarDocumento } from "@/lib/formato";
import { AvisoLimite } from "@/components/limite";
import { carregar } from "@/server/acao";
import { obterUso } from "@/server/quota";
import { listarClientes } from "@/server/clientes";
import { criarClienteAction } from "./actions";
import { CamposCliente } from "./campos";

export default async function ClientesPage({ searchParams }: { searchParams: Busca }) {
  const [{ erro, ok }, [clientes, uso]] = await Promise.all([
    searchParams,
    carregar((ctx) => Promise.all([listarClientes(ctx), obterUso(ctx)])),
  ]);
  const bloqueado = uso.recursos.clientes.atingido;

  return (
    <>
      <h1>Clientes</h1>
      <Mensagens erro={erro} ok={ok} />

      {clientes.length === 0 ? (
        <div className="vazio">Nenhum cliente na carteira.</div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>Nome</th><th>CPF/CNPJ</th><th>Cidade/UF</th><th>Representadas</th></tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/app/clientes/${c.id}`}>{c.nome}</Link></td>
                  <td>{formatarDocumento(c.documento)}</td>
                  <td>{[c.cidade, c.uf].filter(Boolean).join("/") || "—"}</td>
                  <td>{c.representadas.map((r) => r.nome).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="card">
        <h2>Novo cliente</h2>
        <AvisoLimite uso={uso} recurso="clientes" />
        <form action={criarClienteAction} className="grade">
          <CamposCliente />
          <div className="acoes"><button className="btn" type="submit" disabled={bloqueado}>Criar</button></div>
        </form>
      </section>
    </>
  );
}
