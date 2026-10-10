import Link from "next/link";
import { redirect } from "next/navigation";
import { FormDadosUsuario } from "@/components/dados-usuario";
import { carregar } from "@/server/acao";
import { obterAssinatura } from "@/server/assinaturas";
import { cadastroCompleto, obterPerfil } from "@/server/perfil";
import { concluirCadastroAction } from "../perfil/actions";

/** Cadastro exibido somente após o checkout concluído (assinatura ativa). */
export default async function CadastroPage() {
  const [assinatura, perfil] = await carregar((ctx) => Promise.all([obterAssinatura(ctx), obterPerfil(ctx)]));
  if (assinatura?.status !== "active") {
    return (
      <>
        <h1>Cadastro</h1>
        <div className="vazio">O cadastro é liberado após a confirmação da assinatura. <Link href="/app/configurar">Ver planos</Link></div>
      </>
    );
  }
  if (cadastroCompleto(perfil)) redirect("/app/perfil");

  return (
    <>
      <h1>Concluir cadastro</h1>
      <p className="dica">Assinatura confirmada. Precisamos destes dados para emissão de documentos e cumprimento da LGPD.</p>
      <section className="card">
        <FormDadosUsuario acao={concluirCadastroAction} modo="cadastro" iniciais={{ ...perfil, cpf_oculto: null, cnpj_oculto: null }} />
      </section>
    </>
  );
}
