import { AutoRefresh } from "@/components/auto-refresh";
import { Mensagens } from "@/components/form";
import { AvisoLimite } from "@/components/limite";
import { formatarDataHora } from "@/lib/formato";
import { mesAtual } from "@/lib/planos";
import { carregar } from "@/server/acao";
import { listarDocumentos, ROTULO_DOCUMENTO, urlDownload } from "@/server/documentos";
import { obterUso } from "@/server/quota";
import { listarRepresentadas } from "@/server/representadas";
import { gerarDocumentoAction } from "./actions";

const tamanho = (b: number | null) => (b == null ? "—" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { erro, ok } = await searchParams;
  const [documentos, representadas, uso] = await carregar((ctx) =>
    Promise.all([listarDocumentos(ctx), listarRepresentadas(ctx), obterUso(ctx)]),
  );
  const pdf = uso.recursos.pdf_mes;
  const gerando = documentos.some((d) => d.status === "gerando");
  const semRepresentada = representadas.length === 0;

  return (
    <>
      <AutoRefresh ativo={gerando} />
      <h1>Relatórios</h1>
      <Mensagens erro={erro} ok={ok} />

      <section className="card">
        <div className="cabecalho">
          <h2>Gerar PDF</h2>
          <span className="dica">PDFs este mês: {pdf.usado}{pdf.limite != null ? ` de ${pdf.limite}` : " (ilimitado)"}</span>
        </div>
        <AvisoLimite uso={uso} recurso="pdf_mes" />
        <form action={gerarDocumentoAction} className="grade">
          <label className="campo">
            <span>Tipo</span>
            <select name="tipo" defaultValue="relatorio_periodo">
              {Object.entries(ROTULO_DOCUMENTO).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Representada</span>
            <select name="representada_id" required defaultValue="">
              <option value="" disabled>Selecione…</option>
              {representadas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              <option value="todas">Todas (apenas catálogo)</option>
            </select>
          </label>
          <label className="campo">
            <span>Período (relatórios)</span>
            <input type="month" name="periodo" defaultValue={mesAtual()} />
          </label>
          <div className="acoes">
            <button className="btn" type="submit" disabled={pdf.atingido || semRepresentada}>Gerar</button>
            <span className="dica"> Se nada mudou desde a última geração, o PDF é reaproveitado (cache) sem consumir quota.</span>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Documentos gerados</h2>
        {documentos.length === 0 ? (
          <div className="vazio">Nenhum PDF gerado ainda.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Documento</th><th>Tipo</th><th>Solicitado</th><th>Gerado em</th><th>Tamanho</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {documentos.map((d) => (
                  <tr key={d.id} className={d.status === "falha" ? "linha-alerta" : undefined}>
                    <td>{d.titulo ?? "—"}</td>
                    <td>{ROTULO_DOCUMENTO[d.tipo]}</td>
                    <td>{formatarDataHora(d.criado_em)}</td>
                    <td>{d.gerado_em ? formatarDataHora(d.gerado_em) : "—"}</td>
                    <td>{tamanho(d.tamanho)}</td>
                    <td>
                      {d.status === "pronto" && <span className="etiqueta etiqueta-recebida">Pronto</span>}
                      {d.status === "gerando" && <span className="etiqueta etiqueta-a_receber">Gerando…</span>}
                      {d.status === "falha" && <span className="etiqueta etiqueta-atrasada" title={d.erro ?? ""}>Falhou</span>}
                    </td>
                    <td>{d.status === "pronto" && <a className="btn btn-peq" href={urlDownload(d.id)}>Baixar</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
