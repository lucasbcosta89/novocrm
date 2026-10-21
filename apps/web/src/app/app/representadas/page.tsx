import Link from "next/link";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { Mensagens, type Busca } from "@/components/form";
import { AvisoLimite } from "@/components/limite";
import { formatarDocumento } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { obterUso } from "@/server/quota";
import { listarRepresentadasComSkus } from "@/server/representadas";
import { criarRepresentadaAction, excluirRepresentadaAction } from "./actions";
import { CamposEmpresa } from "./campos-empresa";

export default async function RepresentadasPage({ searchParams }: { searchParams: Busca }) {
  const [{ erro, ok }, [representadas, uso]] = await Promise.all([
    searchParams,
    carregar((ctx) => Promise.all([listarRepresentadasComSkus(ctx), obterUso(ctx)])),
  ]);
  const bloqueado = uso.recursos.representadas.atingido;
  const skus = representadas.reduce((s, r) => s + r.skus, 0);

  return (
    <>
      <h1>Representadas</h1>
      <Mensagens erro={erro} ok={ok} />

      {/* Cadastro inline expansível (não modal) */}
      <details className="card novo-inline" open={representadas.length === 0 || undefined}>
        <summary className="btn">Adicionar Representada</summary>
        <AvisoLimite uso={uso} recurso="representadas" />
        <form action={criarRepresentadaAction} className="grade-1">
          <CamposEmpresa />
          <fieldset className="secao-form">
            <legend>Documentos</legend>
            <label className="campo">
              <span>Contrato, cartão CNPJ, tabelas… (até 10 arquivos de 10 MB: PDF, imagens, Office, CSV)</span>
              <input type="file" name="documentos" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt" />
            </label>
          </fieldset>
          <div className="acoes-linha"><button className="btn" type="submit" disabled={bloqueado}>Cadastrar representada</button></div>
        </form>
      </details>

      <section className="card">
        <h2>Lista de Representadas</h2>
        {representadas.length === 0 ? (
          <div className="vazio">Nenhuma representada cadastrada.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Nome</th><th>CNPJ</th><th>Município/UF</th><th>SKUs</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {representadas.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/app/representadas/${r.id}`}>{r.nome}</Link></td>
                    <td>{formatarDocumento(r.cnpj)}</td>
                    <td>{[r.municipio, r.estado].filter(Boolean).join("/") || "—"}</td>
                    <td>{r.skus}</td>
                    <td className="acoes-linha">
                      <Link href={`/app/representadas/${r.id}?editar=1`}>Editar</Link>
                      <form action={excluirRepresentadaAction.bind(null, r.id)}>
                        <BotaoConfirmar texto="Excluir" pergunta={`Excluir “${r.nome}”? Produtos, preços, pontos de faturamento e documentos dela também serão removidos.`} />
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="quadros">
        <section className="card quadro">
          <h2>Empresas Representadas</h2>
          <p className="numero-grande">{representadas.length}</p>
        </section>
        <section className="card quadro">
          <h2>SKUs Cadastrados</h2>
          <p className="numero-grande">{skus}</p>
          <p className="dica">Produtos ativos em todas as representadas.</p>
        </section>
      </div>
    </>
  );
}
