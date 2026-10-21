import { ROTULO_STATUS_PEDIDO } from "@/lib/rotulos";
import { Icone, type NomeIcone } from "./icones";

/** Badge de status com ícone + cor (verde = concluído, azul = em aberto, cinza = cancelado). */
export function Status({ classe, icone, rotulo }: { classe: string; icone: NomeIcone; rotulo: string }) {
  return (
    <span className={`etiqueta etiqueta-icone etiqueta-${classe}`}>
      <Icone nome={icone} tamanho={14} />
      {rotulo}
    </span>
  );
}

const ICONE_PEDIDO: Record<string, NomeIcone> = { rascunho: "relogio", confirmado: "concluido", entregue: "pacote", cancelado: "cancelado" };

export function StatusPedido({ status }: { status: string }) {
  return <Status classe={status} icone={ICONE_PEDIDO[status] ?? "circulo"} rotulo={ROTULO_STATUS_PEDIDO[status] ?? status} />;
}
