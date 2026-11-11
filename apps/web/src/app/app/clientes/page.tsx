import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Mensagens, type Busca } from "@/components/form";
import { Icone } from "@/components/icones";
import { formatarDocumento } from "@/lib/formato";
import { AvisoLimite } from "@/components/limite";
import { carregar } from "@/server/acao";
import { podeImportar } from "@/server/importacao";
import { obterUso } from "@/server/quota";
import { listarClientes } from "@/server/clientes";
import { criarClienteAction } from "./actions";
import { CamposCliente } from "./campos";

export default async function ClientesPage({ searchParams }: { searchParams: Busca }) {
  const [{ erro, ok }, [clientes, uso, importar]] = await Promise.all([
    searchParams,
    carregar((ctx) => Promise.all([listarClientes(ctx), obterUso(ctx), podeImportar(ctx)])),
  ]);
  const bloqueado = uso.recursos.clientes.atingido;
  const semVinculo = clientes.filter((c) => c.representadas.length === 0).length;
  const semDocumento = clientes.filter((c) => !c.documento).length;

  return (
    <>
      <div className="cabecalho-pagina">
        <h1 className="titulo-icone"><Icone nome="pessoas" tamanho={24} /> Clientes</h1>
        <div className="acoes-linha">
          {clientes.length > 0 && (
            <>
              <a className="btn-suave btn-peq" href="/api/clientes/exportar?formato=xlsx" download><Icone nome="download" tamanho={16} /> Exportar XLSX</a>
              <a className="btn-suave btn-peq" href="/api/clientes/exportar?formato=csv" download><Icone nome="download" tamanho={16} /> Exportar CSV</a>
            </>
          )}
          {importar && <Link className="btn-secundario" href="/app/clientes/importar"><Icone nome="arquivo" tamanho={16} /> Cadastrar Clientes com Excel</Link>}
        </div>
      </div>
      <Mensagens erro={erro} ok={ok} />
      {semDocumento > 0 && (
        <p className="aviso aviso-erro" role="alert">
          <span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>
          {semDocumento} cliente(s) sem CNPJ/CPF. O CNPJ/CPF é obrigatório: abra cada cliente marcado abaixo e preencha em “Editar dados”.
        </p>
      )}
      {semVinculo > 0 && (
        <p className="aviso aviso-alerta">
          <span className="circulo-icone"><Icone nome="predio" tamanho={16} /></span>
          {semVinculo} cliente(s) sem representada vinculada. Estabeleça os vínculos dentro da plataforma: abra o cliente e use a aba “Representadas”.
        </p>
      )}

      {clientes.length === 0 ? (
        <div className="vazio">Nenhum cliente na carteira.</div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>Nome</th><th>CNPJ/CPF</th><th>Cidade/UF</th><th>Representadas</th></tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td><span className="com-avatar"><Avatar nome={c.nome} /><Link href={`/app/clientes/${c.id}`}>{c.nome}</Link></span></td>
                  <td>{c.documento ? formatarDocumento(c.documento) : <Link className="etiqueta etiqueta-cancelado" href={`/app/clientes/${c.id}?editar=1#editar`}>Pendente: corrigir</Link>}</td>
                  <td>{c.cidade || c.uf ? <span className="com-icone"><Icone nome="mapa" tamanho={16} /> {[c.cidade, c.uf].filter(Boolean).join("/")}</span> : "—"}</td>
                  <td>{c.representadas.map((r) => r.nome).join(", ") || <Link className="dica" href={`/app/clientes/${c.id}/representadas`}>Sem vínculo: vincular</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="card">
        <h2 className="titulo-icone"><Icone nome="mais" tamanho={20} /> Novo cliente</h2>
        <AvisoLimite uso={uso} recurso="clientes" />
        <form action={criarClienteAction} className="grade">
          <CamposCliente />
          <div className="acoes"><button className="btn" type="submit" disabled={bloqueado}>Criar</button></div>
        </form>
      </section>
    </>
  );
}
