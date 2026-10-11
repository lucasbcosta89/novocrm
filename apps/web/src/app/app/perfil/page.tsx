import { FormDadosUsuario, LinkPolitica } from "@/components/dados-usuario";
import { Mensagens, type Busca } from "@/components/form";
import { formatarDataHora } from "@/lib/formato";
import { carregar } from "@/server/acao";
import { obterPerfil } from "@/server/perfil";
import { obterUso } from "@/server/quota";
import { BotaoUpgrade } from "@/components/upgrade";
import { revelarDocumentosAction, salvarPerfilAction } from "./actions";

export default async function PerfilPage({ searchParams }: { searchParams: Busca }) {
  const [{ ok, erro }, [perfil, uso]] = await Promise.all([searchParams, carregar((ctx) => Promise.all([obterPerfil(ctx), obterUso(ctx)]))]);
  const pdf = uso.recursos.pdf_mes;
  const pct = pdf.limite ? Math.min(100, Math.round((pdf.usado / pdf.limite) * 100)) : 0;
  const aceite = (em: string | null, versao: string | null) => (em ? `${formatarDataHora(em)} · versão ${versao ?? "—"}` : "Não registrado");

  return (
    <>
      <h1>Meus dados</h1>
      <Mensagens erro={erro} ok={ok} />

      <section className="card">
        <h2>Conta</h2>
        <dl className="resumo">
          <div><dt>E-mail</dt><dd>{perfil.email}</dd></div>
        </dl>
        <p className="dica">O e-mail é o login da conta e só pode ser alterado pelo fluxo de autenticação.</p>
      </section>

      <section className="card">
        <h2>Dados cadastrais</h2>
        <FormDadosUsuario acao={salvarPerfilAction} modo="edicao" iniciais={perfil} revelar={revelarDocumentosAction} />
      </section>

      <section className="card">
        <h2>Relatórios e catálogos</h2>
        <p><strong>{pdf.usado}{pdf.limite != null ? ` de ${pdf.limite}` : ""} PDFs este mês</strong>{pdf.limite == null && " (ilimitado no seu plano)"}</p>
        {pdf.limite != null && (
          <div className="barra barra-larga" aria-label={`${pct}% do limite`}><span style={{ width: `${pct}%` }} className={pct >= 80 ? "cheia" : undefined} /></div>
        )}
        {pdf.limite != null && pct >= 80 && (
          <div className="aviso aviso-erro aviso-limite">
            <span>{pdf.atingido ? "Limite de PDFs do mês atingido." : "Você está perto do limite de PDFs do mês."} Faça upgrade para gerar mais.</span>
            <BotaoUpgrade atual={uso.plano.codigo} />
          </div>
        )}
        <p className="dica">Relatórios gerais e Catálogo Geral ficam em Representadas; o catálogo de cada marca, na página da representada.</p>
      </section>

      <section className="card">
        <h2>Consentimentos</h2>
        <dl className="resumo">
          <div><dt>Consentimento LGPD</dt><dd>{aceite(perfil.consentimento_lgpd_aceito_em, perfil.consentimento_lgpd_versao)}</dd></div>
          <div><dt>Política de Privacidade</dt><dd>{aceite(perfil.politica_privacidade_aceita_em, perfil.politica_privacidade_versao)}</dd></div>
        </dl>
        <p className="dica">Registros somente leitura. Reler a <LinkPolitica />.</p>
      </section>
    </>
  );
}
