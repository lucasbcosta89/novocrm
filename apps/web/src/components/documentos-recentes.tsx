import { AutoRefresh } from "@/components/auto-refresh";
import { formatarDataHora } from "@/lib/formato";
import { ROTULO_DOCUMENTO, urlDownload, type Documento } from "@/server/documentos";

/** Lista curta de PDFs gerados (substitui a antiga página /app/relatorios). Atualiza sozinha enquanto há geração. */
export function DocumentosRecentes({ documentos }: { documentos: Documento[] }) {
  if (documentos.length === 0) return <p className="dica">Nenhum PDF gerado ainda.</p>;
  return (
    <>
      <AutoRefresh ativo={documentos.some((d) => d.status === "gerando")} />
      <ul className="lista">
        {documentos.map((d) => (
          <li key={d.id}>
            <span>
              {d.titulo ?? ROTULO_DOCUMENTO[d.tipo]}
              <span className="dica"> · {formatarDataHora(d.gerado_em ?? d.criado_em)}</span>
            </span>
            {d.status === "pronto" && <a className="btn-suave btn-peq" href={urlDownload(d.id)}>Baixar</a>}
            {d.status === "gerando" && <span className="etiqueta etiqueta-a_receber">Gerando…</span>}
            {d.status === "falha" && <span className="etiqueta etiqueta-atrasada" title={d.erro ?? ""}>Falhou</span>}
          </li>
        ))}
      </ul>
    </>
  );
}
