import type { Metadata } from "next";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { POLITICA_MD, VERSAO_POLITICA } from "@/conteudo/politica-privacidade.gerado";

export const metadata: Metadata = { title: "Política de Privacidade — CRM Multimarcas" };

/** Rota pública: conteúdo de docs/politica-privacidade.md (versionado). */
export default function PoliticaPage() {
  return (
    <main className="publico politica">
      <Markdown texto={POLITICA_MD} />
      <p className="dica">Versão {VERSAO_POLITICA}. <Link href="/login">Voltar</Link></p>
    </main>
  );
}
