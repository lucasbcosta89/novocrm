"use client";

import { usePathname, useRouter } from "next/navigation";

/** Dropdown do log: "Todos" ou um funil; troca o ?funil= da URL. */
export function FiltroFunil({ funis, atual }: { funis: { id: string; nome: string }[]; atual: string }) {
  const router = useRouter();
  const caminho = usePathname();
  return (
    <label className="campo campo-filtro">
      <span>Funil</span>
      <select value={atual} onChange={(e) => router.replace(e.target.value ? `${caminho}?funil=${e.target.value}` : caminho, { scroll: false })}>
        <option value="">Todos</option>
        {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
      </select>
    </label>
  );
}
