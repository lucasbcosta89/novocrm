import { Suspense } from "react";
import { Mensagens, type Busca } from "@/components/form";
import { carregar } from "@/server/acao";
import { listarRepresentadas } from "@/server/representadas";
import { AvisoPendentesAnalise } from "@/components/aviso-comissoes";
import { pendentesDeAnalise } from "@/server/comissoes";
import { PainelPrincipal } from "./dashboard/painel-principal";

/** Home: dashboard principal (dados via /api/dashboard). */
export default async function Dashboard({ searchParams }: { searchParams: Busca }) {
  const [{ erro, ok }, representadas, pendentes] = await Promise.all([searchParams, carregar(listarRepresentadas), carregar(pendentesDeAnalise)]);

  const dataExtenso = new Date()
    .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" })
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <>
      <Mensagens erro={erro} ok={ok} />
      {/* Fase 21 (O.2): UM aviso agregado, independente das métricas */}
      <AvisoPendentesAnalise quantidade={pendentes.quantidade} valor={pendentes.valor} />
      <Suspense>
        <PainelPrincipal representadas={representadas.map((r) => ({ id: r.id, nome: r.nome }))} dataExtenso={dataExtenso} />
      </Suspense>
    </>
  );
}
