import Link from "next/link";
import { DocumentosRecentes } from "@/components/documentos-recentes";
import { Icone } from "@/components/icones";
import { carregar } from "@/server/acao";
import { listarClientes } from "@/server/clientes";
import { listarDocumentos } from "@/server/documentos";
import { obterUso } from "@/server/quota";
import { listarRepresentadas } from "@/server/representadas";
import { Biblioteca } from "./biblioteca";

/** Biblioteca: relatórios gerais em PDF (vendas, comissões, KPIs) com o template da Fase 7b e quota pdf_mes. */
export default async function BibliotecaPage() {
  const [uso, clientes, representadas, documentos] = await carregar((ctx) =>
    Promise.all([obterUso(ctx), listarClientes(ctx), listarRepresentadas(ctx), listarDocumentos(ctx, undefined, 10)]),
  );
  const pdf = uso.recursos.pdf_mes;
  const pct = pdf.limite ? Math.min(100, Math.round((pdf.usado / pdf.limite) * 100)) : 0;

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1 className="titulo-icone"><Icone nome="documento" tamanho={24} /> Biblioteca</h1>
          <p className="subtitulo">Relatórios gerais em PDF com o seu cabeçalho de representante.</p>
        </div>
      </div>

      <section className="card quota-pdf">
        <div className="cabecalho">
          <strong>
            {pdf.limite == null ? `${pdf.usado} PDFs este mês (ilimitado no plano ${uso.plano.nome})` : `${pdf.usado} de ${pdf.limite} PDFs este mês`}
          </strong>
          <Link href="/app/perfil">Meus dados</Link>
        </div>
        {pdf.limite != null && (
          <div className="barra barra-larga" role="progressbar" aria-valuemin={0} aria-valuemax={pdf.limite} aria-valuenow={pdf.usado} aria-label="PDFs usados no mês">
            <span className={pdf.atingido ? "cheia" : undefined} style={{ width: `${pct}%` }} />
          </div>
        )}
        {pdf.atingido && (
          <p className="aviso aviso-erro"><span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>Limite de PDFs do mês atingido. <Link href="/app/perfil">Ver em Meus dados</Link></p>
        )}
      </section>

      <Biblioteca
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
        representadas={representadas.map((r) => ({ id: r.id, nome: r.nome }))}
        limiteAtingido={pdf.atingido}
      />

      <section className="card">
        <h2 className="titulo-icone"><Icone nome="historico" tamanho={20} /> Gerados recentemente</h2>
        <DocumentosRecentes documentos={documentos} />
      </section>
    </>
  );
}
