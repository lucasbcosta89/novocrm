import Link from "next/link";
import { Campo, Mensagens, type Busca } from "@/components/form";
import { formatarDocumento, formatarPercentual } from "@/lib/formato";
import { AvisoLimite } from "@/components/limite";
import { carregar } from "@/server/acao";
import { obterUso } from "@/server/quota";
import { listarRepresentadas } from "@/server/representadas";
import { criarRepresentadaAction } from "./actions";

export default async function RepresentadasPage({ searchParams }: { searchParams: Busca }) {
  const [{ erro, ok }, [representadas, uso]] = await Promise.all([
    searchParams,
    carregar((ctx) => Promise.all([listarRepresentadas(ctx), obterUso(ctx)])),
  ]);
  const bloqueado = uso.recursos.representadas.atingido;

  return (
    <>
      <h1>Representadas</h1>
      <Mensagens erro={erro} ok={ok} />

      {representadas.length === 0 ? (
        <div className="vazio">Nenhuma representada cadastrada.</div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>Nome</th><th>CNPJ</th><th>Comissão padrão</th><th>Slug</th></tr>
            </thead>
            <tbody>
              {representadas.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/app/representadas/${r.id}`}>{r.nome}</Link></td>
                  <td>{formatarDocumento(r.cnpj)}</td>
                  <td>{formatarPercentual(r.comissao_padrao)}</td>
                  <td><code>{r.slug}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="card">
        <h2>Nova representada</h2>
        <AvisoLimite uso={uso} recurso="representadas" />
        <form action={criarRepresentadaAction} className="grade">
          <Campo label="Nome *" name="nome" required minLength={2} />
          <Campo label="CNPJ" name="cnpj" inputMode="numeric" placeholder="00.000.000/0000-00" />
          <Campo label="Comissão padrão (%)" name="comissao_padrao" type="number" step="0.01" min="0" max="100" defaultValue="0" />
          <div className="acoes"><button className="btn" type="submit" disabled={bloqueado}>Criar</button></div>
        </form>
      </section>
    </>
  );
}
