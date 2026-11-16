import Link from "next/link";
import { Icone } from "@/components/icones";
import { ETAPAS, GUIA_SUBTITULO, GUIA_TITULO, PERGUNTAS_FREQUENTES, rotuloProntidao, VERIFICACOES } from "@/lib/guia/conteudo";
import { carregar } from "@/server/acao";
import { obterDiagnosticoGuia } from "./actions";
import { SeletorEtapas } from "./seletor";

export const metadata = { title: "Como usar — Plurima" };

/**
 * Fase 23.1 — guia de preenchimento + diagnóstico de completude. Somente leitura: nenhum texto de regra aqui
 * (tudo vem de lib/guia/conteudo.ts) e nenhuma escrita no banco.
 */
export default async function ComoUsarPage() {
  const diag = await carregar(() => obterDiagnosticoGuia());
  const status = new Map(diag.verificacoes.map((v) => [v.id, v.ok]));

  return (
    <>
      <h1 className="titulo-icone"><Icone nome="info" tamanho={24} /> {GUIA_TITULO}</h1>
      <p className="subtitulo">{GUIA_SUBTITULO}</p>

      <section className="card diagnostico-guia" aria-labelledby="diag-titulo">
        <h2 id="diag-titulo" className="titulo-icone"><Icone nome="progresso" tamanho={20} /> {rotuloProntidao(diag.percentual)}</h2>
        <div className="barra barra-larga" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={diag.percentual} aria-label="Prontidão do cadastro">
          <span style={{ width: `${diag.percentual}%` }} />
        </div>
        <ul className="lista-diagnostico">
          {VERIFICACOES.map((v) => {
            const ok = status.get(v.id) ?? false;
            return (
              <li key={v.id} className={ok ? "diag-ok" : "diag-pendente"}>
                <span className={`etiqueta ${ok ? "etiqueta-recebida" : "etiqueta-dev-pendente"}`}>
                  <Icone nome={ok ? "check" : "alerta"} tamanho={14} /> {ok ? "OK" : "Pendente"}
                </span>
                <div>
                  <strong>{v.rotulo}</strong>
                  <p className="dica">{v.impacto}</p>
                </div>
                {!ok && <Link className="btn-link" href={v.href}>Resolver</Link>}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="guia-layout">
        <nav className="guia-ancoras" aria-label="Etapas do guia">
          <SeletorEtapas etapas={ETAPAS.map((e) => ({ id: e.id, titulo: e.titulo }))} />
          <ul>
            {ETAPAS.map((e) => <li key={e.id}><a href={`#${e.id}`}>{e.titulo}</a></li>)}
            <li><a href="#perguntas">Perguntas frequentes</a></li>
          </ul>
        </nav>

        <div className="guia-etapas">
          {ETAPAS.map((e, i) => (
            <details key={e.id} id={e.id} className="card guia-etapa" open={i === 0}>
              <summary aria-controls={`${e.id}-corpo`}>
                <span className="guia-etapa-titulo">{e.titulo}</span>
                <span className="dica">{e.subtitulo}</span>
              </summary>
              <div id={`${e.id}-corpo`} className="guia-etapa-corpo">
                <h3>Por que importa</h3>
                <p>{e.porqueImporta}</p>
                <h3>O que preencher</h3>
                <ul>{e.oQuePreencher.map((t) => <li key={t}>{t}</li>)}</ul>
                <h3>O que acontece se faltar</h3>
                <ul>{e.oQueQuebra.map((t) => <li key={t}>{t}</li>)}</ul>
                {e.nota && <p className="aviso aviso-alerta guia-nota"><Icone nome="info" tamanho={16} /> {e.nota}</p>}
                <div className="acoes-linha">
                  <Link className="btn btn-peq" href={e.linkPara}>{e.rotuloLink ?? "Ir para a página"}</Link>
                  {e.modulosRelacionados.map((m) => <Link key={m.href} className="btn-link" href={m.href}>{m.rotulo}</Link>)}
                </div>
              </div>
            </details>
          ))}

          <section className="card" id="perguntas" aria-labelledby="faq-titulo">
            <h2 id="faq-titulo" className="titulo-icone"><Icone nome="info" tamanho={20} /> Perguntas frequentes</h2>
            <dl className="guia-faq">
              {PERGUNTAS_FREQUENTES.map((p) => (
                <div key={p.pergunta}><dt>{p.pergunta}</dt><dd>{p.resposta}</dd></div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
