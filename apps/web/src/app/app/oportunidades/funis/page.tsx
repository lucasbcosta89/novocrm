import { carregar } from "@/server/acao";
import { listarKanban } from "@/server/oportunidades";
import { listarRepresentadas } from "@/server/representadas";
import { Kanban } from "../kanban";

/** Subpágina "Funis": kanban das oportunidades não arquivadas. */
export default async function FunisPage() {
  const [itens, representadas] = await carregar((ctx) => Promise.all([listarKanban(ctx), listarRepresentadas(ctx)]));
  return <Kanban inicial={itens} representadas={representadas.map((r) => ({ id: r.id, nome: r.nome }))} />;
}
