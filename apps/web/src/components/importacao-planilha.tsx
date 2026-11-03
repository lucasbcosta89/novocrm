"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { RelatorioImportacao, ResultadoValidacaoLinha } from "@/lib/cadastros/tipos";
import { baixarArquivo, baixarModelo, EXTENSOES_IMPORTACAO, lerPlanilha, relatorioErrosCsv } from "@/lib/importacao/arquivos";
import { resumirValidacao, validarPlanilha, type LinhaBruta } from "@/lib/importacao/motor";
import { IMPORTACOES, type EntidadeImportacao } from "@/lib/importacao/registro";
import { Icone } from "./icones";

const ETAPAS = ["Upload", "Pré-validação", "Conferência", "Confirmação", "Resultado"] as const;
const MAX_PROBLEMAS_TELA = 300;

type Fase =
  | { tipo: "upload"; erro?: string }
  | { tipo: "validando"; feitas: number; total: number; texto: string }
  | { tipo: "conferencia"; arquivo: File; cabecalho: string[]; brutas: LinhaBruta[]; linhas: ResultadoValidacaoLinha[]; iniciado_em: string; erro?: string }
  | { tipo: "gravando"; total: number }
  | { tipo: "resultado"; relatorio: RelatorioImportacao };

const ETAPA_DA_FASE: Record<Fase["tipo"], number> = { upload: 0, validando: 1, conferencia: 2, gravando: 3, resultado: 4 };
const ROTULO_CLASSE = { valida: "Válida", com_alerta: "Com alerta", invalida: "Inválida" } as const;

/** Uma linha por problema (erro ou alerta) para as tabelas de conferência e resultado. */
function problemas(linhas: readonly ResultadoValidacaoLinha[], filtro: "todos" | "invalida" | "com_alerta" = "todos") {
  return linhas
    .filter((l) => (filtro === "todos" ? l.classificacao !== "valida" : l.classificacao === filtro))
    .flatMap((l) => [
      ...l.erros.map((p) => ({ ...p, linha: l.numero_linha, tipo: "Erro" as const, classe: l.classificacao })),
      ...l.alertas.map((p) => ({ ...p, linha: l.numero_linha, tipo: "Alerta" as const, classe: l.classificacao })),
    ]);
}

/**
 * Importação por planilha GENÉRICA, em 5 etapas: upload → pré-validação (sem gravar, com progresso) →
 * conferência (contagens + problemas linha a linha) → confirmação (grava só as válidas, num lote) → resultado.
 * Tudo que é da entidade vem da ConfiguracaoImportacao registrada em lib/importacao/registro.
 */
export function ImportacaoPlanilha({ entidade, voltar }: { entidade: EntidadeImportacao; voltar: string }) {
  const config = IMPORTACOES[entidade];
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [fase, setFase] = useState<Fase>({ tipo: "upload" });
  const [filtro, setFiltro] = useState<"todos" | "invalida" | "com_alerta">("todos");
  const atual = ETAPA_DA_FASE[fase.tipo];

  async function prevalidar() {
    if (!arquivo) return;
    const iniciado_em = new Date().toISOString();
    setFase({ tipo: "validando", feitas: 0, total: 0, texto: "Lendo o arquivo…" });
    try {
      const { cabecalho, linhas: brutas } = await lerPlanilha(arquivo, config.maxLinhas);
      setFase({ tipo: "validando", feitas: 0, total: brutas.length, texto: `Consultando ${config.mensagens.plural} já cadastradas…` });
      const r = await fetch(`/api/importacao/${entidade}/existentes`);
      const json = (await r.json().catch(() => null)) as [string, unknown][] | { erro?: string } | null;
      if (!r.ok || !Array.isArray(json)) throw new Error((json && !Array.isArray(json) && json.erro) || "Não foi possível consultar os cadastros existentes.");
      const linhas = await validarPlanilha(config, cabecalho, brutas, new Map(json), (feitas, total) =>
        setFase({ tipo: "validando", feitas, total, texto: `Validando linha ${feitas.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}…` }),
      );
      setFiltro("todos");
      setFase({ tipo: "conferencia", arquivo, cabecalho, brutas, linhas, iniciado_em });
    } catch (e) {
      setFase({ tipo: "upload", erro: e instanceof Error ? e.message : "Não foi possível ler o arquivo." });
    }
  }

  async function confirmar() {
    if (fase.tipo !== "conferencia") return;
    const anterior = fase;
    setFase({ tipo: "gravando", total: anterior.linhas.filter((l) => l.classificacao !== "invalida").length });
    try {
      const r = await fetch(`/api/importacao/${entidade}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivo_nome: anterior.arquivo.name, iniciado_em: anterior.iniciado_em, cabecalho: anterior.cabecalho, linhas: anterior.brutas }),
      });
      const json = (await r.json().catch(() => null)) as (RelatorioImportacao & { erro?: string }) | null;
      if (!r.ok || !json || json.erro) throw new Error(json?.erro ?? "Não foi possível concluir a importação. Nada foi gravado.");
      setFase({ tipo: "resultado", relatorio: json });
    } catch (e) {
      setFase({ ...anterior, erro: e instanceof Error ? e.message : "Não foi possível concluir a importação. Nada foi gravado." });
    }
  }

  function recomecar() {
    setArquivo(null);
    setFase({ tipo: "upload" });
  }

  const nomeBase = (fase.tipo === "conferencia" ? fase.arquivo.name : fase.tipo === "resultado" ? fase.relatorio.arquivo_nome : "planilha").replace(EXTENSOES_IMPORTACAO, "");
  const exportarRelatorio = (linhas: readonly ResultadoValidacaoLinha[]) =>
    baixarArquivo(relatorioErrosCsv({ linhas: [...linhas] }), `relatorio-erros-${nomeBase}.csv`, "text/csv;charset=utf-8");

  return (
    <div className="grade-1 importar">
      <ol className="etapas-importacao etapas-horizontais" aria-label="Etapas da importação">
        {ETAPAS.map((nome, i) => {
          const estado = i < atual || fase.tipo === "resultado" ? "ok" : i === atual ? "ativa" : "pendente";
          return (
            <li key={nome} className={`etapa etapa-${estado}`} aria-current={estado === "ativa" ? "step" : undefined}>
              <span className="etapa-marca" aria-hidden="true">{estado === "ok" ? <Icone nome="check" tamanho={14} /> : i + 1}</span>
              {nome}
            </li>
          );
        })}
      </ol>

      {fase.tipo === "upload" && (
        <section className="card grade-1">
          <div className="importar-bloco">
            <span className="circulo-icone tom-azul"><Icone nome="download" tamanho={16} /></span>
            <div>
              <p>{config.mensagemModelo}</p>
              <div className="acoes-linha">
                <button type="button" className="btn-suave btn-peq" onClick={() => baixarModelo(config, "xlsx")}><Icone nome="download" tamanho={16} /> Modelo .xlsx</button>
                <button type="button" className="btn-suave btn-peq" onClick={() => baixarModelo(config, "csv")}><Icone nome="download" tamanho={16} /> Modelo .csv</button>
              </div>
            </div>
          </div>
          <label className="campo">
            <span>Arquivo (.xlsx ou .csv, até {config.maxLinhas.toLocaleString("pt-BR")} linhas)</span>
            <input type="file" accept=".xlsx,.csv" onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setFase({ tipo: "upload" }); }} />
          </label>
          {fase.erro && <p className="erro-campo" role="alert">{fase.erro}</p>}
          <div className="acoes-linha">
            <button type="button" className="btn" disabled={!arquivo} onClick={prevalidar}><Icone nome="check" tamanho={16} /> Validar arquivo</button>
            <Link className="btn-link" href={voltar}>Cancelar</Link>
          </div>
          <p className="dica">A validação não grava nada: você confere o resultado antes de confirmar.</p>
        </section>
      )}

      {fase.tipo === "validando" && (
        <section className="card grade-1" role="status" aria-live="polite">
          <p>{fase.texto}</p>
          <div className="progresso progresso-importacao" aria-hidden="true">
            <span style={{ width: `${fase.total ? Math.round((fase.feitas / fase.total) * 100) : 5}%` }} />
          </div>
          <p className="dica">Nada é gravado nesta etapa.</p>
        </section>
      )}

      {fase.tipo === "conferencia" && (() => {
        const r = resumirValidacao(fase.linhas);
        const gravaveis = r.validas + r.com_alerta;
        const lista = problemas(fase.linhas, filtro);
        return (
          <section className="card grade-1">
            <p className="aviso aviso-alerta importar-aviso" role="status">
              <span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>
              Conferência de “{fase.arquivo.name}”: nada foi gravado ainda.
            </p>
            <dl className="kpis importar-resumo">
              <div className="kpi"><div><dt>Linhas lidas</dt><dd>{r.total_linhas}</dd></div></div>
              <div className="kpi"><div><dt>Válidas</dt><dd className="txt-ok">{r.validas}</dd></div></div>
              <div className="kpi"><div><dt>Com alerta</dt><dd>{r.com_alerta}</dd></div></div>
              <div className="kpi"><div><dt>Inválidas</dt><dd className="atrasada">{r.invalidas}</dd></div></div>
            </dl>
            {fase.erro && <p className="aviso aviso-erro" role="alert"><span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>{fase.erro}</p>}
            {r.com_alerta + r.invalidas > 0 && (
              <>
                <div className="acoes-linha">
                  <label className="campo campo-inline">
                    <span>Mostrar</span>
                    <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
                      <option value="todos">Inválidas e com alerta</option>
                      <option value="invalida">Só inválidas</option>
                      <option value="com_alerta">Só com alerta</option>
                    </select>
                  </label>
                  <button type="button" className="btn-suave btn-peq" onClick={() => exportarRelatorio(fase.linhas)}><Icone nome="download" tamanho={16} /> Exportar relatório (CSV)</button>
                </div>
                <TabelaProblemas lista={lista} />
              </>
            )}
            <div className="acoes-linha">
              <button type="button" className="btn" disabled={gravaveis === 0} onClick={confirmar}>
                <Icone nome="check" tamanho={16} /> Confirmar importação de {gravaveis} linha(s)
              </button>
              <button type="button" className="btn-link" onClick={recomecar}>Escolher outro arquivo</button>
            </div>
            <p className="dica">
              Só as linhas válidas e com alerta serão gravadas, todas de uma vez: se algo falhar, nada é gravado.
              {r.invalidas > 0 && ` ${r.invalidas} linha(s) inválida(s) ficarão de fora.`}
            </p>
          </section>
        );
      })()}

      {fase.tipo === "gravando" && (
        <section className="card grade-1" role="status" aria-live="polite">
          <p>Gravando {fase.total} linha(s) em um único lote…</p>
          <div className="progresso progresso-importacao progresso-indeterminado" aria-hidden="true"><span /></div>
          <p className="dica">Não feche esta página até concluir.</p>
        </section>
      )}

      {fase.tipo === "resultado" && (() => {
        const rel = fase.relatorio;
        const lista = problemas(rel.linhas, "invalida");
        return (
          <section className="card grade-1">
            <p className="aviso aviso-ok importar-aviso" role="status">
              <span className="circulo-icone"><Icone nome="check" tamanho={16} /></span>
              Importação concluída: {rel.inseridas + rel.atualizadas} {config.mensagens.plural} gravada(s).
            </p>
            <dl className="kpis importar-resumo">
              <div className="kpi"><div><dt>Importadas</dt><dd className="txt-ok">{rel.inseridas + rel.atualizadas}</dd></div></div>
              <div className="kpi"><div><dt>Novas</dt><dd>{rel.inseridas}</dd></div></div>
              <div className="kpi"><div><dt>Atualizadas</dt><dd>{rel.atualizadas}</dd></div></div>
              <div className="kpi"><div><dt>Ignoradas (com erro)</dt><dd className="atrasada">{rel.ignoradas}</dd></div></div>
            </dl>
            {rel.ignoradas > 0 && (
              <>
                <p className="dica">As linhas abaixo não foram gravadas. Corrija no arquivo e envie de novo: o que já entrou é atualizado pelo CNPJ, sem duplicar.</p>
                <div className="acoes-linha">
                  <button type="button" className="btn-suave btn-peq" onClick={() => exportarRelatorio(rel.linhas)}><Icone nome="download" tamanho={16} /> Relatório de erros (CSV)</button>
                </div>
                <TabelaProblemas lista={lista} />
              </>
            )}
            <div className="acoes-linha">
              <Link className="btn" href={voltar}>Ver {config.mensagens.plural}</Link>
              <button type="button" className="btn-link" onClick={recomecar}>Importar outro arquivo</button>
            </div>
          </section>
        );
      })()}
    </div>
  );
}

function TabelaProblemas({ lista }: { lista: ReturnType<typeof problemas> }) {
  const visiveis = useMemo(() => lista.slice(0, MAX_PROBLEMAS_TELA), [lista]);
  if (lista.length === 0) return <p className="vazio">Nenhum problema neste filtro.</p>;
  return (
    <>
      <div className="tabela-wrap importar-erros">
        <table className="tabela">
          <thead><tr><th className="num">Linha</th><th>Situação</th><th>Campo</th><th>Mensagem</th><th>Valor recebido</th></tr></thead>
          <tbody>
            {visiveis.map((p, i) => (
              <tr key={`${p.linha}-${p.campo}-${i}`}>
                <td className="num" data-rotulo="Linha">{p.linha}</td>
                <td data-rotulo="Situação"><span className={`etiqueta etiqueta-${p.tipo === "Erro" ? "cancelado" : "rascunho"}`}>{p.tipo === "Erro" ? ROTULO_CLASSE.invalida : ROTULO_CLASSE.com_alerta}</span></td>
                <td data-rotulo="Campo"><code>{p.campo}</code></td>
                <td data-rotulo="Mensagem">{p.mensagem}</td>
                <td data-rotulo="Valor recebido">{p.valor_recebido ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lista.length > MAX_PROBLEMAS_TELA && <p className="dica">Mostrando {MAX_PROBLEMAS_TELA} de {lista.length} problemas. O relatório CSV traz todos.</p>}
    </>
  );
}
