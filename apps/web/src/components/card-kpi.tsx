import Link from "next/link";
import { Icone, type NomeIcone } from "./icones";

const pct = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/**
 * Card de KPI: valor em destaque, rótulo, ícone e variação vs período anterior (↑/↓ com cor).
 * inverso: subir é ruim (ex.: atrasos). Com href, o card é um link.
 */
export function CardKpi({ titulo, valor, variacao, icone, tom, href, inverso = false, pontos = false }: {
  titulo: string; valor: string; variacao: number | null; icone: NomeIcone; tom: string; href?: string; inverso?: boolean;
  /** variação em pontos percentuais (p.p.) em vez de % */
  pontos?: boolean;
}) {
  const bom = variacao == null || variacao === 0 ? null : (variacao > 0) !== inverso;
  const conteudo = (
    <>
      <span className="dash-kpi-topo">
        <span className="dash-kpi-titulo">{titulo}</span>
        <span className={`kpi-icone ${tom}`}><Icone nome={icone} tamanho={18} /></span>
      </span>
      <span className="dash-kpi-valor">{valor}</span>
      <span className={`dash-variacao ${bom === null ? "" : bom ? "positiva" : "negativa"}`}>
        {variacao == null
          ? "— sem base anterior"
          : variacao === 0
            ? "estável vs período anterior"
            : `${variacao > 0 ? "↑" : "↓"} ${pontos ? `${Math.abs(variacao).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.` : pct(Math.abs(variacao))} vs período anterior`}
      </span>
    </>
  );
  return href ? <Link href={href} className="dash-card dash-kpi">{conteudo}</Link> : <div className="dash-card dash-kpi">{conteudo}</div>;
}
