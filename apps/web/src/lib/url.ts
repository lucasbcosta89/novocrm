/** Acrescenta ?chave=valor antes de um eventual #fragmento. */
export function comParam(url: string, chave: string, valor: string) {
  const [caminho = "", hash] = url.split("#");
  const sep = caminho.includes("?") ? "&" : "?";
  return `${caminho}${sep}${chave}=${encodeURIComponent(valor)}${hash ? `#${hash}` : ""}`;
}
