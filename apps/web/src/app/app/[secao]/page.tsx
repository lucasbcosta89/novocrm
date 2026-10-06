import { notFound } from "next/navigation";
import { buscarSecao } from "@/lib/navegacao";

export default async function SecaoPage({ params }: { params: Promise<{ secao: string }> }) {
  const secao = buscarSecao((await params).secao);
  if (!secao) notFound();
  return (
    <>
      <h1>{secao.titulo}</h1>
      <div className="vazio">Em breve.</div>
    </>
  );
}
