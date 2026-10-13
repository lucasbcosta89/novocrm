"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Menu superior persistente das páginas de representada/cliente: cada aba é uma rota própria. */
export function Abas({ base, abas }: { base: string; abas: { href: string; rotulo: string }[] }) {
  const caminho = usePathname();
  return (
    <nav className="abas abas-app" aria-label="Seções">
      {abas.map((a) => {
        const alvo = a.href ? `${base}/${a.href}` : base;
        const ativa = a.href ? caminho === alvo || caminho.startsWith(`${alvo}/`) : caminho === base;
        return (
          <Link key={a.href || "inicio"} href={alvo} className={ativa ? "aba ativa" : "aba"} aria-current={ativa ? "page" : undefined}>
            {a.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
