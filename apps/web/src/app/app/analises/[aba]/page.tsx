import { notFound } from "next/navigation";
import { ehPreset } from "@/lib/analises/presets";
import { carregar } from "@/server/acao";
import { opcoesFiltros } from "@/server/analises";
import { TelaAnalise } from "./tela";

/** Análises: as 5 subpáginas são a mesma tela com presets diferentes. */
export default async function AbaAnalisePage({ params }: { params: Promise<{ aba: string }> }) {
  const { aba } = await params;
  if (!ehPreset(aba)) notFound();
  const opcoes = await carregar(opcoesFiltros);
  return <TelaAnalise aba={aba} opcoes={opcoes} />;
}
