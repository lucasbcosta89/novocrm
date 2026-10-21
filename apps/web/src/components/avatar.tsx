/** Avatar com as iniciais do nome (até 2 letras). Decorativo: o nome sempre aparece ao lado. */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0]![0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]![0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

export function Avatar({ nome, pequeno }: { nome: string | null | undefined; pequeno?: boolean }) {
  return (
    <span className={pequeno ? "avatar avatar-peq" : "avatar"} aria-hidden="true">
      {iniciais(nome)}
    </span>
  );
}
