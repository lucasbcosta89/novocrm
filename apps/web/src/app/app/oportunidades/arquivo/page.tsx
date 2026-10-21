import Link from "next/link";
import { Icone } from "@/components/icones";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { ROTULO_RESULTADO } from "@/lib/rotulos";
import { carregar } from "@/server/acao";
import { listarFunis } from "@/server/funis";
import { listarKanban } from "@/server/oportunidades";

/** Subpágina "Arquivo": oportunidades arquivadas (fora dos funis e da contagem em aberto). */
export default async function ArquivoPage() {
  const [itens, funis] = await carregar((ctx) => Promise.all([listarKanban(ctx, true), listarFunis(ctx)]));
  const nomeFunil = new Map(funis.map((f) => [f.id, f.nome] as const));

  return (
    <section className="card">
      <h2 className="titulo-icone"><Icone nome="arquivo" tamanho={20} /> Oportunidades arquivadas</h2>
      {itens.length === 0 ? (
        <div className="vazio">Nenhuma oportunidade arquivada.</div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>Oportunidade</th><th>Cliente</th><th>Representada</th><th>Funil</th><th>Resultado</th><th className="num">Valor estimado</th><th>Concluída em</th></tr>
            </thead>
            <tbody>
              {itens.map((o) => (
                <tr key={o.id}>
                  <td>{o.titulo}</td>
                  <td>{o.cliente ? <Link href={`/app/clientes/${o.cliente.id}`}>{o.cliente.nome}</Link> : "—"}</td>
                  <td>{o.representada?.nome ?? "—"}</td>
                  <td>{(o.funil_id && nomeFunil.get(o.funil_id)) ?? "—"}</td>
                  <td>
                    {o.resultado ? (
                      <span className={`etiqueta ${o.resultado === "ganhou" ? "etiqueta-recebida" : "etiqueta-atrasada"}`}>{ROTULO_RESULTADO[o.resultado]}</span>
                    ) : "—"}
                  </td>
                  <td className="num">{o.valor_estimado != null ? formatarMoeda(Number(o.valor_estimado)) : "—"}</td>
                  <td>{o.data_conclusao ? formatarData(o.data_conclusao) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
