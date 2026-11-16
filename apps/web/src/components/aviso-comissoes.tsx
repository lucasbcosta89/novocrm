import Link from "next/link";
import { Icone } from "@/components/icones";
import { AVISO_PENDENTES_ANALISE } from "@/lib/comissoes/status";
import { formatarMoeda } from "@/lib/formato";

/**
 * Fase 21 (O) — UM aviso agregado por usuário, com todos os motivos juntos (nunca um alerta por comissão). Vive na
 * página de Comissões e no dashboard; some quando não resta comissão pendente de análise.
 */
export function AvisoPendentesAnalise({ quantidade, valor }: { quantidade: number; valor: number }) {
  if (quantidade <= 0) return null;
  return (
    <div className="aviso aviso-analise" role="status">
      <span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>
      <div>
        <strong>{AVISO_PENDENTES_ANALISE}</strong> · {quantidade} {quantidade === 1 ? "comissão" : "comissões"} ({formatarMoeda(valor)})
        <div className="acoes-aviso">
          <Link href="/app/representadas">Definir no Cadastro da Representada</Link>
          <Link href="/app/representadas">Definir no Catálogo</Link>
          <Link href="/app/comissoes?visao=analise">Analisar na página de Comissões</Link>
        </div>
      </div>
    </div>
  );
}
