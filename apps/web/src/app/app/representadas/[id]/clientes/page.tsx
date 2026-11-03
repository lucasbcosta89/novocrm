import Link from "next/link";
import { Icone } from "@/components/icones";
import { carregar } from "@/server/acao";
import { listarClientesDaRepresentada } from "@/server/consultas";

/** Clientes vinculados à representada (ação "ver clientes vinculados" da listagem). */
export default async function RepresentadaClientes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clientes = await carregar((ctx) => listarClientesDaRepresentada(ctx, id));
  return (
    <section className="card">
      <h2 className="titulo-icone"><Icone nome="pessoas" tamanho={20} /> Clientes vinculados ({clientes.length})</h2>
      {clientes.length === 0 ? (
        <div className="vazio">Nenhum cliente vinculado a esta representada.</div>
      ) : (
        <ul className="lista">
          {clientes.map((c) => (
            <li key={c.id}><span className="com-icone"><Icone nome="pessoas" tamanho={16} /><Link href={`/app/clientes/${c.id}`}>{c.nome}</Link></span></li>
          ))}
        </ul>
      )}
    </section>
  );
}
