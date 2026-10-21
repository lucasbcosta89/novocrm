import { Abas } from "@/components/abas";
import { Icone } from "@/components/icones";

/** Título + menu superior das oportunidades: Início (funis e log), Funis (kanban) e Arquivo. */
export default function OportunidadesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="titulo-icone"><Icone nome="funil" tamanho={24} /> Oportunidades</h1>
      <Abas
        base="/app/oportunidades"
        abas={[
          { href: "", rotulo: "Início", icone: "painel" },
          { href: "funis", rotulo: "Funis", icone: "funil" },
          { href: "arquivo", rotulo: "Arquivo", icone: "arquivo" },
        ]}
      />
      {children}
    </>
  );
}
