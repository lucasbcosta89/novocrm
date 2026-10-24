"use client";

export type OpcaoMulti = { id: string; nome: string };

/**
 * Lista de caixas de seleção dentro de um menu expansível (multi-select acessível, sem dependência).
 * Sem `aoMudar`: não controlado (envia em formulário pelo `nome`). Com `aoMudar`: controlado.
 */
export function MultiSelect({ nome, rotulo, opcoes, selecionados, aoMudar, todos = "Todas" }: {
  nome?: string; rotulo: string; opcoes: OpcaoMulti[]; selecionados: string[]; aoMudar?: (ids: string[]) => void; todos?: string;
}) {
  const marcados = opcoes.filter((o) => selecionados.includes(o.id));
  return (
    <div className="campo">
      <span>{rotulo}</span>
      <details className="multi">
        <summary>{marcados.length === 0 ? todos : marcados.length === 1 ? marcados[0]!.nome : `${marcados.length} selecionados`}</summary>
        <div className="multi-opcoes" role="group" aria-label={rotulo}>
          {opcoes.length === 0 && <span className="dica">Nenhuma opção.</span>}
          {opcoes.map((o) => (
            <label key={o.id} className="check">
              {aoMudar ? (
                <input type="checkbox" checked={selecionados.includes(o.id)}
                  onChange={(e) => aoMudar(e.target.checked ? [...selecionados, o.id] : selecionados.filter((x) => x !== o.id))} />
              ) : (
                <input type="checkbox" name={nome} value={o.id} defaultChecked={selecionados.includes(o.id)} />
              )}{" "}
              {o.nome}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
