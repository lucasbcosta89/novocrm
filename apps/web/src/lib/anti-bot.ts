/**
 * Proteção contra cadastro/login automatizado (farm de trials). Camadas:
 * 1. honeypot: campo invisível que só robôs preenchem;
 * 2. e-mail descartável recusado no cadastro;
 * 3. Cloudflare Turnstile (verificação no servidor) — ativo só quando TURNSTILE_SECRET_KEY e
 *    TURNSTILE_SITE_KEY estão no .env (sem as chaves, dev/testes seguem funcionando).
 */
export const CAMPO_HONEYPOT = "site_empresa";

const DESCARTAVEIS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com",
  "sharklasers.com", "trashmail.com", "getnada.com", "dispostable.com", "maildrop.cc", "throwawaymail.com",
  "fakeinbox.com", "mailnesia.com", "tempmailo.com", "emailondeck.com", "moakt.com", "mohmal.com",
]);

export function emailDescartavel(email: string): boolean {
  const dominio = email.split("@")[1]?.trim().toLowerCase() ?? "";
  return DESCARTAVEIS.has(dominio);
}

export function turnstileAtivo(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY && !!process.env.TURNSTILE_SITE_KEY;
}

/** Devolve a mensagem de erro, ou null se passou. `fetcher` injetável para testes. */
export async function verificarHumano(fd: FormData, ip: string | null, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (String(fd.get(CAMPO_HONEYPOT) ?? "") !== "") return "Não foi possível concluir. Tente novamente.";
  if (!turnstileAtivo()) return null;
  const token = String(fd.get("cf-turnstile-response") ?? "");
  if (!token) return "Confirme que você não é um robô.";
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const r = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const j = (await r.json()) as { success?: boolean };
    return j.success ? null : "Verificação anti-robô falhou. Tente novamente.";
  } catch {
    return "Não foi possível verificar agora. Tente novamente.";
  }
}
