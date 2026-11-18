import { ROTULO_RECURSO, type Recurso } from "@/lib/planos";
import type { Uso } from "@/server/quota";

/** Banner de teto de uso justo (plano único: só WhatsApp tem teto; os demais recursos são ilimitados → não aparece). */
export function AvisoLimite({ uso, recurso }: { uso: Uso; recurso: Recurso }) {
  const r = uso.recursos[recurso];
  if (!r.atingido) return null;
  return (
    <div className="aviso aviso-erro aviso-limite">
      <span>
        <strong>Limite de uso justo atingido</strong> — até {r.limite} {ROTULO_RECURSO[recurso].toLowerCase()}.
        Fale com o suporte se precisar de mais.
      </span>
    </div>
  );
}
