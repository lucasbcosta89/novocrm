import { Fragment, type ReactNode } from "react";

/** Renderizador mínimo e seguro (sem HTML bruto) para o markdown da política: títulos, listas, citações, **negrito** e [links](url). */
function inline(texto: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    if (m[1]) partes.push(<strong key={m.index}>{m[1]}</strong>);
    else if (m[2] && m[3]) {
      const href = /^(https?:|mailto:|\/)/.test(m[3]) ? m[3] : "#";
      partes.push(<a key={m.index} href={href} target={href.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer">{m[2]}</a>);
    } else if (m[4]) partes.push(<code key={m.index}>{m[4]}</code>);
    ultimo = re.lastIndex;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

export function Markdown({ texto }: { texto: string }) {
  const blocos = texto.trim().split(/\n{2,}/);
  return (
    <div className="markdown">
      {blocos.map((b, i) => {
        const linhas = b.split("\n");
        if (/^#{1,3} /.test(b)) {
          const nivel = b.match(/^#+/)![0].length;
          const conteudo = inline(b.replace(/^#+ /, ""));
          return nivel === 1 ? <h1 key={i}>{conteudo}</h1> : nivel === 2 ? <h2 key={i}>{conteudo}</h2> : <h3 key={i}>{conteudo}</h3>;
        }
        if (linhas.every((l) => /^[-*] /.test(l))) return <ul key={i}>{linhas.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>;
        if (linhas.every((l) => l.startsWith(">"))) return <blockquote key={i}>{inline(linhas.map((l) => l.replace(/^>\s?/, "")).join(" "))}</blockquote>;
        return <p key={i}>{linhas.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}
