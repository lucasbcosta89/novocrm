import Link from "next/link";
import { Campo, Mensagens, type Busca } from "@/components/form";
import { formatarDocumento, formatarPercentual } from "@/lib/formato";
import { AvisoLimite } from "@/components/limite";
import { carregar } from "@/server/acao";
import { obterUso } from "@/server/quota";
import { listarRepresentadas } from "@/server/representadas";
import { criarRepresentadaAction } from "./actions";
import { DocumentosRecentes } from "@/components/documentos-recentes";
import { mesAtual } from "@/lib/planos";
import { listarDocumentos } from "@/server/documentos";
import { gerarDocumentoAction } from "./documentos-actions";

export default async function RepresentadasPage({ searchParams }: { searchParams: Busca }) {
  const [{ erro, ok }, [representadas, uso, documentos]] = await Promise.all([
    searchParams,
    carregar((ctx) => Promise.all([listarRepresentadas(ctx), obterUso(ctx), listarDocumentos(ctx, { geral: true }, 8)])),
  ]);
  const semPdf = uso.recursos.pdf_mes.atingido || representadas.length === 0;
  const bloqueado = uso.recursos.representadas.atingido;

  return (
    <>
      <h1>Representadas</h1>
      <Mensagens erro={erro} ok={ok} />

      {/* Documentos gerais: todas as representadas em um único PDF (quota pdf_mes por documento) */}
      <section className="card" id="documentos">
        <h2>Relatórios e catálogos gerais</h2>
        <AvisoLimite uso={uso} recurso="pdf_mes" />
        <form action={gerarDocumentoAction.bind(null, "/app/representadas#documentos")} className="barra-acoes">
          <input type="hidden" name="representada_id" value="todas" />
          <label className="campo">
            <span>Período (relatórios)</span>
            <input type="month" name="periodo" defaultValue={mesAtual()} required />
          </label>
          <button className="btn" type="submit" name="tipo" value="relatorio_periodo" disabled={semPdf}>Relatório Mensal (Geral)</button>
          <button className="btn" type="submit" name="tipo" value="relatorio_comissao" disabled={semPdf}>Relatório de Comissões (Geral)</button>
          <button className="btn" type="submit" name="tipo" value="catalogo_geral" disabled={semPdf}>Catálogo Geral</button>
          <span className="dica">PDFs este mês: {uso.recursos.pdf_mes.usado}{uso.recursos.pdf_mes.limite != null ? ` de ${uso.recursos.pdf_mes.limite}` : ""}</span>
        </form>
        <DocumentosRecentes documentos={documentos} />
      </section>

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
