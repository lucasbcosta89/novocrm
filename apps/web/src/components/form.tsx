import type { InputHTMLAttributes } from "react";
import { Icone } from "./icones";

export function Mensagens({ erro, ok }: { erro?: string; ok?: string }) {
  return (
    <>
      {erro && <p className="aviso aviso-erro" role="alert"><span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>{erro}</p>}
      {ok && <p className="aviso aviso-ok" role="status"><span className="circulo-icone"><Icone nome="check" tamanho={16} /></span>{ok}</p>}
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
