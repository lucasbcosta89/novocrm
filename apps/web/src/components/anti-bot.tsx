import Script from "next/script";
import { CAMPO_HONEYPOT } from "@/lib/anti-bot";

/** Honeypot + widget do Cloudflare Turnstile (só aparece com TURNSTILE_SITE_KEY). */
export function AntiBot() {
  const chave = process.env.TURNSTILE_SITE_KEY;
  return (
    <>
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>Site da empresa<input name={CAMPO_HONEYPOT} tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>
      {chave && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
          <div className="cf-turnstile" data-sitekey={chave} data-language="pt-BR" data-theme="auto" />
        </>
      )}
    </>
  );
}
