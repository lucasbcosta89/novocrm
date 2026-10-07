import { ROTULO_RECURSO, type Recurso } from "@/lib/planos";
import type { Uso } from "@/server/quota";
import { BotaoUpgrade } from "./upgrade";

/** Banner "limite atingido — upgrade" (não trava o resto da página). */
export function AvisoLimite({ uso, recurso }: { uso: Uso; recurso: Recurso }) {
  const r = uso.recursos[recurso];
  if (!r.atingido) return null;
  return (
    <div className="aviso aviso-erro aviso-limite">
      <span>
        <strong>Limite atingido</strong> — seu plano {uso.plano.nome} permite {r.limite} {ROTULO_RECURSO[recurso].toLowerCase()}.
        Faça upgrade para cadastrar mais.
      </span>
      <BotaoUpgrade atual={uso.plano.codigo} />
    </div>
  );
}
