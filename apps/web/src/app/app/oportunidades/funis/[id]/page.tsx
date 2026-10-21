import { notFound } from "next/navigation";
import { Mensagens, type Busca } from "@/components/form";
import { carregar } from "@/server/acao";
import { listarFunis } from "@/server/funis";
import { listarKanban } from "@/server/oportunidades";
import { listarRepresentadas } from "@/server/representadas";
import { Kanban } from "../../kanban";

/** Kanban de um funil: colunas = etapas do funil; troca de funil pelo dropdown do topo. */
export default async function FunilKanbanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Busca }) {
  const [{ id }, { erro, ok }] = await Promise.all([params, searchParams]);
  const [funis, itens, representadas] = await carregar((ctx) => Promise.all([listarFunis(ctx), listarKanban(ctx), listarRepresentadas(ctx)]));
  const funil = funis.find((f) => f.id === id);
  if (!funil) notFound();

  return (
    <>
      <Mensagens erro={erro} ok={ok} />
      <Kanban
        key={funil.id}
        funil={{ id: funil.id, nome: funil.nome, etapas: funil.etapas }}
        funis={funis.map((f) => ({ id: f.id, nome: f.nome }))}
        inicial={itens.filter((o) => o.funil_id === funil.id)}
        representadas={representadas.map((r) => ({ id: r.id, nome: r.nome }))}
        hoje={new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })}
      />
    </>
  );
}
