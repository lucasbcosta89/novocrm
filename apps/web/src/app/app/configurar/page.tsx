import { redirect } from "next/navigation";
import { Mensagens } from "@/components/form";
import { Icone } from "@/components/icones";
import { OpcoesPlano } from "@/components/upgrade";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { diasAte, fimDaCarencia, FORMAS, PLANO, ROTULO_RECURSO } from "@/lib/planos";
import { carregar } from "@/server/acao";
import { obterAcesso } from "@/server/acesso";
import { conciliarAssinatura, obterAssinatura } from "@/server/assinaturas";
import { obterContexto } from "@/server/contexto";
import { obterUso } from "@/server/quota";
import { cancelarAssinaturaAction, verificarPagamentoAction } from "./actions";

const ROTULO_ASSINATURA: Record<string, string> = {
  pending: "Aguardando pagamento",
  active: "Ativa",
  paused: "Pausada",
  cancelled: "Cancelada",
  expired: "Expirada",
};

/** Assinatura do plano único (paywall): trial de 7 dias sem cartão, depois mensal ou anual pelo Mercado Pago. */
export default async function ConfigurarPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string; retorno?: string }>;
}) {
  const { erro, ok, retorno } = await searchParams;
  // Voltando do checkout ou com assinatura pendente: confere no MP e libera o acesso se o pagamento já foi aprovado.
  const pendente = (await carregar(obterAssinatura))?.status === "pending";
  if (retorno === "mp" || pendente) {
    const { userId } = await obterContexto();
    await conciliarAssinatura(userId).catch((e) => console.error("conciliação MP", e));
  }
  const [uso, assinatura, acesso] = await carregar((ctx) => Promise.all([obterUso(ctx), obterAssinatura(ctx), obterAcesso(ctx)]));

  // checkout concluído → cadastro pós-checkout (dados + LGPD), se ainda não feito
  if (retorno === "mp" && assinatura?.status === "active") {
    const { data: u } = await (await obterContexto()).supabase.from("usuarios").select("consentimento_lgpd_aceito_em").maybeSingle<{ consentimento_lgpd_aceito_em: string | null }>();
    if (!u?.consentimento_lgpd_aceito_em) redirect("/app/cadastro");
  }

  const carencia = fimDaCarencia(assinatura?.periodo_fim ?? null);
  const whatsapp = uso.recursos.conversas_mes;
  const vigente = acesso.estado === "assinante" || acesso.estado === "carencia";
  const forma = assinatura?.forma ? FORMAS[assinatura.forma] : null;
  const formaAtiva = vigente && assinatura?.status === "active" ? assinatura.forma : null;
  const recorrenteAtiva = formaAtiva === "cartao_mensal";
  // pagamento único (Pix ou cartão anual) vencendo em até 7 dias: hora de renovar
  const diasParaVencer = vigente && forma && !forma.recorrente ? diasAte(assinatura?.periodo_fim ?? null) : null;

  return (
    <>
      <h1 className="titulo-icone"><Icone nome="engrenagem" tamanho={24} /> Assinatura</h1>
      <Mensagens erro={erro} ok={ok} />
      {retorno === "mp" && (
        <p className="aviso aviso-ok">
          Recebemos seu retorno do Mercado Pago. O acesso completo é liberado assim que o pagamento for aprovado — normalmente em instantes.
        </p>
      )}
      {carencia && (
        <p className="aviso aviso-erro alerta">
          Pagamento da assinatura pendente. Seu acesso continua completo até {formatarData(carencia.toISOString())};
          depois disso a conta fica somente leitura até o pagamento (nenhum dado é apagado).
        </p>
      )}

      <section className="card">
        <h2 className="titulo-icone"><Icone nome="cartao" tamanho={20} /> {PLANO.nome}</h2>
        <dl className="resumo">
          <div>
            <dt>Situação</dt>
            <dd>
              {acesso.estado === "trial" && `Teste grátis — ${acesso.diasTrial} dia(s) restante(s)`}
              {acesso.estado === "assinante" && "Assinatura ativa"}
              {acesso.estado === "carencia" && "Pagamento pendente (carência)"}
              {acesso.estado === "leitura" && "Somente leitura — assine para voltar a criar e editar"}
            </dd>
          </div>
          {acesso.estado === "trial" && acesso.trialFim && <div><dt>Teste grátis até</dt><dd>{formatarData(acesso.trialFim)}</dd></div>}
          {assinatura && <div><dt>Assinatura</dt><dd>{ROTULO_ASSINATURA[assinatura.status] ?? assinatura.status}{forma && ` · ${forma.rotulo}`}</dd></div>}
          {forma && <div><dt>Valor</dt><dd>{forma.parcelas > 1 ? `12x de ${formatarMoeda(forma.valorMensal)}` : formatarMoeda(forma.cobranca)}{forma.recorrente ? "/mês" : forma.meses === 12 ? " (12 meses)" : " (1 mês)"}</dd></div>}
          {assinatura?.periodo_fim && <div><dt>{recorrenteAtiva ? "Próxima cobrança" : "Acesso pago até"}</dt><dd>{formatarData(assinatura.periodo_fim)}</dd></div>}
        </dl>
        {diasParaVencer != null && diasParaVencer <= 7 && (
          <p className="aviso aviso-paywall">
            {diasParaVencer <= 1 ? "Seu acesso pago termina hoje." : `Seu acesso pago termina em ${diasParaVencer} dias.`} Renove abaixo para não perder o acesso.
          </p>
        )}
        {recorrenteAtiva && (
          <form action={cancelarAssinaturaAction}>
            <button className="btn-link" type="submit">Cancelar assinatura no cartão</button>
            <span className="dica"> O acesso continua até {assinatura?.periodo_fim ? formatarData(assinatura.periodo_fim) : "o fim do período pago"}.</span>
          </form>
        )}
        {assinatura?.status === "pending" && (
          <form action={verificarPagamentoAction}>
            <button className="btn btn-peq" type="submit">Já paguei — verificar pagamento</button>
          </form>
        )}
      </section>

      <section className="card" id="planos">
        <h2 className="titulo-icone"><Icone nome="pacote" tamanho={20} /> {vigente ? "Renovar ou trocar a forma de pagamento" : "Escolha como pagar"}</h2>
        <p className="dica">Um plano só, com todas as funcionalidades. No Pix sai mais barato; no cartão mensal a cobrança é automática.
          Pagamentos novos somam ao período que você já tem.</p>
        <OpcoesPlano atual={formaAtiva} />
      </section>

      <section className="card">
        <h2 className="titulo-icone"><Icone nome="escudo" tamanho={20} /> Uso justo</h2>
        <p className="dica">
          Sem limite de representadas, clientes, oportunidades ou PDFs. Para proteger a plataforma contra uso automatizado, há
          limites de ritmo na geração de PDFs (até 15 a cada 10 minutos) e um teto de {whatsapp.limite?.toLocaleString("pt-BR")} {ROTULO_RECURSO.conversas_mes.toLowerCase()}.
        </p>
        <dl className="resumo">
          <div><dt>{ROTULO_RECURSO.conversas_mes} ({uso.mes})</dt><dd>{whatsapp.usado.toLocaleString("pt-BR")} de {whatsapp.limite?.toLocaleString("pt-BR") ?? "—"}</dd></div>
          <div><dt>{ROTULO_RECURSO.pdf_mes} ({uso.mes})</dt><dd>{uso.recursos.pdf_mes.usado.toLocaleString("pt-BR")}</dd></div>
        </dl>
      </section>
    </>
  );
}
