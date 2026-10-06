import type { InputHTMLAttributes } from "react";

export function Mensagens({ erro, ok }: { erro?: string; ok?: string }) {
  return (
    <>
      {erro && <p className="aviso aviso-erro">{erro}</p>}
      {ok && <p className="aviso aviso-ok">{ok}</p>}
    </>
  );
}

export function Campo({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="campo">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

export type Busca = Promise<{ erro?: string; ok?: string }>;
