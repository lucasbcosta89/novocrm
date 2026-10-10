import { redirect } from "next/navigation";
import { Mensagens } from "@/components/form";
import { OpcoesPlano } from "@/components/upgrade";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { fimDaCarencia, RECURSOS, RECURSOS_MENSAIS, ROTULO_RECURSO } from "@/lib/planos";
import { carregar } from "@/server/acao";
import { conciliarAssinatura, obterAssinatura } from "@/server/assinaturas";
import { obterContexto } from "@/server/contexto";
import { verificarPagamentoAction } from "./actions";
import { obterUso } from "@/server/quota";

const ROTULO_ASSINATURA: Record<string, string> = {
  pending: "Aguardando pagamento",
  active: "Ativa",
  paused: "Pausada",
  cancelled: "Cancelada",
  expired: "Expirada",
};

export default async function ConfigurarPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string; retorno?: string }>;
}) {
  const { erro, ok, retorno } = await searchParams;
  // Voltando do checkout ou com assinatura pendente: confere no MP e libera o plano se o pagamento já foi aprovado.
  const pendente = (await carregar(obterAssinatura))?.status === "pending";
  if (retorno === "mp" || pendente) {
    const { userId } = await obterContexto();
    await conciliarAssinatura(userId).catch((e) => console.error("conciliação MP", e));
  }
  const [uso, assinatura] = await carregar((ctx) => Promise.all([obterUso(ctx), obterAssinatura(ctx)]));

  // checkout concluído → cadastro pós-checkout (dados + LGPD), se ainda não feito
  if (retorno === "mp" && assinatura?.status === "active") {
    const { data: u } = await (await obterContexto()).supabase.from("usuarios").select("consentimento_lgpd_aceito_em").maybeSingle<{ consentimento_lgpd_aceito_em: string | null }>();
    if (!u?.consentimento_lgpd_aceito_em) redirect("/app/cadastro");
  }

  const carencia = fimDaCarencia(assinatura?.periodo_fim ?? null);

  return (
    <>
      <h1>Configurar</h1>
      <Mensagens erro={erro} ok={ok} />
      {retorno === "mp" && (
        <p className="aviso aviso-ok">
          Recebemos seu retorno do Mercado Pago. O plano é liberado assim que o pagamento for aprovado — normalmente em instantes.
        </p>
      )}
      {carencia && (
        <p className="aviso aviso-erro alerta">
          Pagamento da assinatura pendente. Seu plano continua ativo até {formatarData(carencia.toISOString())};
          depois disso a conta volta para o plano Solo (nenhum dado é apagado).
        </p>
      )}

      <section className="card">
        <h2>Plano atual: {uso.plano.nome}</h2>
        <dl className="resumo">
          <div><dt>Mensalidade</dt><dd>{formatarMoeda(uso.plano.preco)}</dd></div>
          <div><dt>Assinatura</dt><dd>{assinatura ? ROTULO_ASSINATURA[assinatura.status] ?? assinatura.status : "Sem assinatura"}</dd></div>
          {assinatura?.status === "pending" && <div><dt>Plano escolhido</dt><dd>{assinatura.plano}</dd></div>}
          {assinatura?.periodo_fim && <div><dt>Válida até</dt><dd>{formatarData(assinatura.periodo_fim)}</dd></div>}
        </dl>
        {assinatura?.status === "pending" && (
          <form action={verificarPagamentoAction}>
            <button className="btn btn-peq" type="submit">Já paguei — verificar pagamento</button>
          </form>
        )}
      </section>

      <section className="card">
        <h2>Uso e limites</h2>
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr><th>Recurso</th><th>Uso</th><th>Limite</th><th></th></tr>
            </thead>
            <tbody>
              {RECURSOS.map((r) => {
                const u = uso.recursos[r];
                const pct = u.limite ? Math.min(100, Math.round((u.usado / u.limite) * 100)) : 0;
                return (
                  <tr key={r} className={u.atingido ? "linha-alerta" : undefined}>
                    <td>{ROTULO_RECURSO[r]}{RECURSOS_MENSAIS.includes(r) && <span className="dica"> ({uso.mes})</span>}</td>
                    <td>{u.usado}</td>
                    <td>{u.limite ?? "Ilimitado"}</td>
                    <td>
                      {u.limite != null && (
                        <div className="barra" aria-label={`${pct}%`}><span style={{ width: `${pct}%` }} className={u.atingido ? "cheia" : undefined} /></div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" id="planos">
        <h2>Planos</h2>
        <OpcoesPlano atual={uso.plano.codigo} />
      </section>
    </>
  );
}
