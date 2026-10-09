import { carregar } from "@/server/acao";
import { listarKanban } from "@/server/oportunidades";
import { listarRepresentadas } from "@/server/representadas";
import { Kanban } from "./kanban";

export default async function OportunidadesPage() {
  const [itens, representadas] = await carregar((ctx) => Promise.all([listarKanban(ctx), listarRepresentadas(ctx)]));
  return (
    <>
      <h1>Oportunidades</h1>
      <Kanban inicial={itens} representadas={representadas.map((r) => ({ id: r.id, nome: r.nome }))} />
    </>
  );
}
