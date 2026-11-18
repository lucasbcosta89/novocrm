import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/sidebar";
import { Onboarding } from "@/components/onboarding";
import { COOKIE_SIDEBAR } from "@/lib/navegacao";
import { statusDosGrupos } from "@/lib/comissoes/status";
import { calcularAcesso, diasAte } from "@/lib/planos";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Cadastro pós-checkout pendente: assinatura ativa sem aceite LGPD registrado
  const [{ data: usuario }, { data: assinatura }, jar, pedidosPend, comissoesPend] = await Promise.all([
    supabase.from("usuarios").select("nome, trial_fim, consentimento_lgpd_aceito_em, onboarding_concluido, onboarding_pulado, onboarding_etapa").eq("id", user.id)
      .maybeSingle<{ nome: string; trial_fim: string | null; consentimento_lgpd_aceito_em: string | null; onboarding_concluido: boolean; onboarding_pulado: boolean; onboarding_etapa: number }>(),
    supabase.from("assinaturas").select("status, periodo_fim").eq("user_id", user.id).maybeSingle<{ status: string; periodo_fim: string | null }>(),
    cookies(),
    // Fase 23.3: selos do menu (só contagens; RLS)
    supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("tem_pendencias", true),
    supabase.from("comissoes").select("id", { count: "exact", head: true }).in("status", statusDosGrupos(["em_analise"])),
  ]);
  const cadastroPendente = assinatura?.status === "active" && !usuario?.consentimento_lgpd_aceito_em;
  // Paywall: o bloqueio real é no banco (gatilho exigir_assinatura); aqui só o aviso.
  const acesso = calcularAcesso({ trial_fim: usuario?.trial_fim ?? null, assinatura: assinatura ?? null });
  const diasTrial = diasAte(usuario?.trial_fim ?? null);

  return (
    <Shell nome={usuario?.nome ?? null} colapsadaInicial={jar.get(COOKIE_SIDEBAR)?.value === "colapsada"}
      pendencias={{ pedidos: pedidosPend.count ?? 0, comissoes: comissoesPend.count ?? 0 }}>
      {cadastroPendente && (
        <p className="aviso aviso-erro alerta">
          Assinatura confirmada! Falta concluir seu cadastro. <Link href="/app/cadastro">Concluir cadastro</Link>
        </p>
      )}
      {acesso === "trial" && diasTrial <= 3 && (
        <p className="aviso aviso-paywall">
          {diasTrial <= 1 ? "Seu teste grátis termina hoje." : `Faltam ${diasTrial} dias do seu teste grátis.`}{" "}
          <Link href="/app/configurar#planos">Assinar a Plurima</Link>
        </p>
      )}
      {acesso === "carencia" && (
        <p className="aviso aviso-erro alerta">
          Não conseguimos confirmar o pagamento da sua assinatura. <Link href="/app/configurar">Regularizar pagamento</Link>
        </p>
      )}
      {acesso === "leitura" && (
        <p className="aviso aviso-erro alerta aviso-paywall">
          <strong>Sua conta está em modo somente leitura.</strong> Seus dados continuam aqui — assine para voltar a criar e editar.{" "}
          <Link href="/app/configurar#planos" className="btn btn-peq">Assinar agora</Link>
        </p>
      )}
      {children}
      {/* Fase 23.2: passo a passo do primeiro login (nunca bloqueia; sempre há Pular) */}
      <Onboarding inicial={{ concluido: usuario?.onboarding_concluido ?? true, pulado: usuario?.onboarding_pulado ?? false, etapa: usuario?.onboarding_etapa ?? 0 }} />
    </Shell>
  );
}
