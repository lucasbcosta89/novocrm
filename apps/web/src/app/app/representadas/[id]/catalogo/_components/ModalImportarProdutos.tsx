"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icone } from "@/components/icones";
import { CAMPOS_MODELO, ROTULOS, validarCabecalho, type Campo } from "@/lib/import/validarCabecalho";
import { Modal } from "@/app/app/oportunidades/comum";
import { importarProdutos, type ErroLinha, type ResultadoCommit } from "../_actions/importarProdutos";

const MODELO = "/templates/modelo-cadastro-produtos.xlsx";
const LIMITE_BYTES = 5 * 1024 * 1024;
const MAX_LINHAS = 5000;
const EXTENSOES = /\.(xlsx|xls)$/i;

/** Etapas na ordem em que realmente acontecem (4 no navegador, 2 na Server Action). */
const ETAPAS = ["Enviando arquivo", "Lendo o arquivo", "Validando colunas", "Normalizando os dados", "Validando registros", "Gravando no catálogo"] as const;
type EstadoEtapa = "pendente" | "ativa" | "ok" | "erro";

type Fase =
  | { tipo: "inicio" }
  | { tipo: "processando" }
  | { tipo: "cabecalho"; faltando: Campo[]; extras: string[] }
  | { tipo: "falha"; mensagem: string }
  | { tipo: "resultado"; lidas: number; validas: number; erros: ErroLinha[]; commit: ResultadoCommit | null };

const nomeCampo = (c: string) => (c in ROTULOS ? ROTULOS[c as Campo] : c);

/** Relatório de erros em CSV (separador ";" e BOM para abrir certo no Excel em português). */
function baixarCsv(erros: ErroLinha[], arquivo: string) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const linhas = [["Linha", "Campo", "Mensagem"], ...erros.map((e) => [e.linha, nomeCampo(e.campo), e.mensagem])].map((l) => l.map(esc).join(";"));
  const url = URL.createObjectURL(new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `erros-${arquivo.replace(EXTENSOES, "")}.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Botão "Importar produtos" + modal: explicação, seletor (.xlsx/.xls, até 5 MB), etapas reais da
 * importação, erro de cabeçalho, resultado com erros (tabela + CSV) ou sucesso.
 */
export function ModalImportarProdutos({ representadaId, onRecarregar }: { representadaId: string; onRecarregar?: () => void }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [fase, setFase] = useState<Fase>({ tipo: "inicio" });
  const [etapas, setEtapas] = useState<EstadoEtapa[]>(ETAPAS.map(() => "pendente"));

  const marcar = (i: number, estado: EstadoEtapa) => setEtapas((xs) => xs.map((e, j) => (j === i ? estado : e)));
  const executar = async <T,>(i: number, fn: () => Promise<T> | T): Promise<T> => {
    marcar(i, "ativa");
    try {
      const r = await fn();
      marcar(i, "ok");
      return r;
    } catch (e) {
      marcar(i, "erro");
      throw e;
    }
  };

  function reiniciar() {
    setArquivo(null);
    setErroArquivo(null);
    setFase({ tipo: "inicio" });
    setEtapas(ETAPAS.map(() => "pendente"));
  }

  function escolher(f: File | null) {
    setErroArquivo(null);
    setArquivo(null);
    if (!f) return;
    if (!EXTENSOES.test(f.name)) return setErroArquivo("Envie o arquivo do modelo em .xlsx ou .xls.");
    if (f.size > LIMITE_BYTES) return setErroArquivo("Arquivo acima de 5 MB.");
    setArquivo(f);
  }

  async function importar() {
    if (!arquivo) return;
    setFase({ tipo: "processando" });
    setEtapas(ETAPAS.map(() => "pendente"));
    try {
      // 1. carrega os bytes do arquivo escolhido
      const bytes = await executar(0, () => arquivo.arrayBuffer());
      // 2. lê a primeira aba da planilha (SheetJS carregado só agora)
      const matriz = await executar(1, async () => {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(bytes, { type: "array" });
        const aba = wb.Sheets[wb.SheetNames[0] ?? ""];
        if (!aba) throw new Error("A planilha está vazia.");
        return XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, raw: true, defval: "", blankrows: true });
      });
      // 3. cabeçalho = linha 1, comparado com o modelo
      const cab = await executar(2, () => validarCabecalho(matriz[0] ?? []));
      if (cab.faltando.length > 0) {
        marcar(2, "erro");
        return setFase({ tipo: "cabecalho", faltando: cab.faltando, extras: cab.extras });
      }
      // 4. linhas → objetos pelos campos do modelo (linhas vazias são puladas; __linha = número real na planilha)
      const linhas = await executar(3, () => {
        const objs: Record<string, unknown>[] = [];
        matriz.slice(1).forEach((celulas, i) => {
          if (!celulas.some((c) => String(c ?? "").trim() !== "")) return;
          const obj: Record<string, unknown> = { __linha: i + 2 };
          for (const campo of CAMPOS_MODELO) {
            const idx = cab.indices[campo];
            if (idx !== undefined) obj[campo] = typeof celulas[idx] === "string" ? (celulas[idx] as string).trim() : celulas[idx];
          }
          objs.push(obj);
        });
        if (objs.length === 0) throw new Error("A planilha não tem produtos (preencha a partir da linha 2).");
        if (objs.length > MAX_LINHAS) throw new Error(`A planilha tem ${objs.length} linhas; o máximo é ${MAX_LINHAS} por importação.`);
        return objs;
      });
      // 5. Server Action em modo preview
      const previa = await executar(4, () => importarProdutos({ representada_id: representadaId, arquivo: arquivo.name, modo: "preview", linhas }));
      if (previa.modo !== "preview") throw new Error("Resposta inesperada do servidor.");
      if (previa.validas === 0) {
        marcar(5, "erro");
        return setFase({ tipo: "resultado", lidas: previa.total, validas: 0, erros: previa.erros, commit: null });
      }
      // 6. Server Action em modo commit (grava as linhas válidas)
      const commit = await executar(5, () => importarProdutos({ representada_id: representadaId, arquivo: arquivo.name, modo: "commit", linhas }));
      if (commit.modo !== "commit") throw new Error("Resposta inesperada do servidor.");
      setFase({ tipo: "resultado", lidas: commit.total, validas: commit.inseridos + commit.atualizados, erros: commit.erros, commit });
      router.refresh(); // a listagem já reflete o que foi gravado
    } catch (e) {
      // Server Actions em produção não expõem a mensagem: orientação genérica
      const msg = e instanceof Error && e.message && !/Server Components render/i.test(e.message) ? e.message : "Não foi possível concluir a importação. Tente novamente.";
      setFase({ tipo: "falha", mensagem: msg });
    }
  }

  function irParaCatalogo() {
    setAberto(false);
    reiniciar();
    if (onRecarregar) onRecarregar();
    else router.refresh();
    setTimeout(() => document.getElementById("produtos")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }

  const processando = fase.tipo === "processando";
  return (
    <>
      <button type="button" className="btn-secundario btn-peq" onClick={() => { reiniciar(); setAberto(true); }}>
        <Icone nome="documento" tamanho={16} /> Importar produtos
      </button>
      {aberto && (
        <Modal titulo="Importar produtos" onFechar={() => setAberto(false)} largo={false}>
          <div className="grade-1 importar">
            {fase.tipo === "inicio" && (
              <>
                <div className="importar-bloco">
                  <span className="circulo-icone tom-azul"><Icone nome="download" tamanho={16} /></span>
                  <div>
                    <strong>1. Use o modelo</strong>
                    <p>Baixe o modelo, preencha a aba Produtos a partir da linha 2 e envie o arquivo aqui.</p>
                    <a className="btn-suave btn-peq" href={MODELO} download><Icone nome="download" tamanho={16} /> Baixar modelo (.xlsx)</a>
                  </div>
                </div>
                <div className="aviso aviso-alerta importar-aviso">
                  <span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>
                  <ul>
                    <li>A importação aceita <strong>apenas o modelo fornecido</strong>; planilhas exportadas de outros sistemas não funcionarão.</li>
                    <li><strong>Obrigatórios:</strong> Nome, SKU, Unidade e NCM.</li>
                    <li>Preço, desconto e comissão são opcionais e podem ser preenchidos depois, manualmente, no produto.</li>
                  </ul>
                </div>
                <label className="campo">
                  <span>Arquivo da planilha (.xlsx ou .xls, até 5 MB)</span>
                  <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(e) => escolher(e.target.files?.[0] ?? null)} />
                </label>
                {erroArquivo && <p className="erro-campo" role="alert">{erroArquivo}</p>}
                <div className="acoes-linha">
                  <button type="button" className="btn" disabled={!arquivo} onClick={importar}><Icone nome="check" tamanho={16} /> Iniciar importação</button>
                  <button type="button" className="btn-link" onClick={() => setAberto(false)}>Cancelar</button>
                </div>
              </>
            )}

            {fase.tipo !== "inicio" && (
              <ol className="etapas-importacao" aria-label="Etapas da importação">
                {ETAPAS.map((nome, i) => (
                  <li key={nome} className={`etapa etapa-${etapas[i]}`} aria-current={etapas[i] === "ativa" ? "step" : undefined}>
                    <span className="etapa-marca" aria-hidden="true">
                      {etapas[i] === "ok" ? <Icone nome="check" tamanho={14} /> : etapas[i] === "erro" ? <Icone nome="fechar" tamanho={14} /> : etapas[i] === "ativa" ? <span className="girando" /> : i + 1}
                    </span>
                    <span>{nome}</span>
                    <span className="sr-only">{etapas[i] === "ok" ? " (concluída)" : etapas[i] === "ativa" ? " (em andamento)" : etapas[i] === "erro" ? " (interrompida)" : ""}</span>
                  </li>
                ))}
              </ol>
            )}
            {processando && <p className="dica" role="status">Não feche esta janela até concluir.</p>}

            {fase.tipo === "cabecalho" && (
              <div className="aviso aviso-erro importar-aviso" role="alert">
                <span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>
                <div>
                  <strong>O cabeçalho do arquivo não corresponde ao modelo. Nada foi gravado.</strong>
                  <p>Colunas obrigatórias que faltaram: {fase.faltando.map((c) => ROTULOS[c]).join(", ")}.</p>
                  {fase.extras.length > 0 && <p>Colunas não reconhecidas: {fase.extras.join(", ")}.</p>}
                  <p>Baixe o modelo novamente e copie seus dados para ele, sem alterar a linha 1.</p>
                  <a className="btn-suave btn-peq" href={MODELO} download><Icone nome="download" tamanho={16} /> Baixar modelo</a>
                </div>
              </div>
            )}

            {fase.tipo === "falha" && (
              <p className="aviso aviso-erro" role="alert"><span className="circulo-icone"><Icone nome="alerta" tamanho={16} /></span>{fase.mensagem}</p>
            )}

            {fase.tipo === "resultado" && fase.erros.length === 0 && fase.commit && (
              <div className="aviso aviso-ok importar-aviso" role="status">
                <span className="circulo-icone"><Icone nome="check" tamanho={16} /></span>
                <div>
                  <strong>Importação concluída.</strong>
                  <p>{fase.commit.inseridos} produto(s) cadastrado(s) e {fase.commit.atualizados} atualizado(s).</p>
                </div>
              </div>
            )}

            {fase.tipo === "resultado" && fase.erros.length > 0 && (
              <>
                <dl className="kpis importar-resumo">
                  <div className="kpi"><div><dt>Linhas lidas</dt><dd>{fase.lidas}</dd></div></div>
                  <div className="kpi"><div><dt>Válidas</dt><dd className="txt-ok">{fase.validas}</dd></div></div>
                  <div className="kpi"><div><dt>Com erro</dt><dd className="atrasada">{new Set(fase.erros.map((e) => e.linha)).size}</dd></div></div>
                </dl>
                <p className="dica">
                  {fase.commit
                    ? `As linhas válidas foram gravadas (${fase.commit.inseridos} cadastrada(s), ${fase.commit.atualizados} atualizada(s)). Corrija as linhas abaixo e importe de novo.`
                    : "Nenhuma linha válida: nada foi gravado. Corrija as linhas abaixo e importe de novo."}
                </p>
                <div className="tabela-wrap importar-erros">
                  <table className="tabela">
                    <thead><tr><th className="num">Linha</th><th>Campo</th><th>Mensagem</th></tr></thead>
                    <tbody>
                      {fase.erros.map((e, i) => (
                        <tr key={`${e.linha}-${e.campo}-${i}`}><td className="num">{e.linha}</td><td>{nomeCampo(e.campo)}</td><td>{e.mensagem}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="acoes-linha">
                  <button type="button" className="btn-secundario btn-peq" onClick={() => baixarCsv(fase.erros, arquivo?.name ?? "importacao")}>
                    <Icone nome="download" tamanho={16} /> Baixar relatório (CSV)
                  </button>
                </div>
              </>
            )}

            {(fase.tipo === "cabecalho" || fase.tipo === "falha" || fase.tipo === "resultado") && (
              <div className="acoes-linha">
                {fase.tipo === "resultado" && fase.commit && (
                  <button type="button" className="btn" onClick={irParaCatalogo}><Icone nome="pacote" tamanho={16} /> Ir para o Catálogo para conferência</button>
                )}
                <button type="button" className="btn-link" onClick={reiniciar}>Importar outro arquivo</button>
                <button type="button" className="btn-link" onClick={() => setAberto(false)}>Fechar</button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
