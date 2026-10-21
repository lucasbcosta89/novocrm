"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icone } from "@/components/icones";
import { adicionarEtapaAction, excluirEtapaAction, renomearEtapaAction } from "./actions";
import { Modal } from "./comum";
import type { FunilKanban } from "./kanban";

/**
 * Popup "Personalizar Funil": adicionar, renomear e excluir etapas.
 * A etapa de fechamento é protegida (não renomeia nem exclui; o servidor também bloqueia).
 */
export function PersonalizarFunil({ funil, onFechar, onEtapaExcluida }: {
  funil: FunilKanban; onFechar: () => void; onEtapaExcluida: (etapaId: string) => void;
}) {
  const router = useRouter();
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [nova, setNova] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);

  async function executar(fn: () => Promise<{ ok?: true; erro?: string }>, sucesso: string, depois?: () => void) {
    setOcupado(true);
    setMsg(null);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return setMsg({ erro: r.erro });
    depois?.();
    setMsg({ ok: sucesso });
    router.refresh();
  }

  return (
    <Modal titulo={`Personalizar Funil — ${funil.nome}`} onFechar={onFechar} largo={false}>
      <div className="grade-1">
        <ul className="lista lista-etapas">
          {funil.etapas.map((e, i) => {
            const nome = nomes[e.id] ?? e.nome;
            return (
              <li key={e.id}>
                <span className="numero-etapa">{i + 1}</span>
                {e.e_fechamento ? (
                  <span className="etapa-protegida">
                    <strong>{e.nome}</strong>
                    <span className="item-sub com-icone"><Icone nome="escudo" tamanho={14} /> Etapa de fechamento (protegida)</span>
                  </span>
                ) : (
                  <>
                    <input
                      className="input-etapa"
                      value={nome}
                      maxLength={60}
                      aria-label={`Nome da etapa ${i + 1}`}
                      onChange={(ev) => setNomes((x) => ({ ...x, [e.id]: ev.target.value }))}
                    />
                    <span className="acoes-linha">
                      <button type="button" className="btn-suave btn-peq" disabled={ocupado || !nome.trim() || nome.trim() === e.nome}
                        onClick={() => executar(() => renomearEtapaAction(e.id, nome), "Etapa renomeada")}>
                        Renomear
                      </button>
                      <button type="button" className="btn-link perigo" disabled={ocupado}
                        onClick={() => {
                          if (!window.confirm(`Excluir a etapa “${e.nome}”? As oportunidades dela vão para a primeira etapa do funil.`)) return;
                          void executar(() => excluirEtapaAction(e.id), "Etapa excluída", () => onEtapaExcluida(e.id));
                        }}>
                        <Icone nome="lixeira" tamanho={16} /> Excluir
                      </button>
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        <form
          className="inline"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!nova.trim()) return;
            void executar(() => adicionarEtapaAction(funil.id, nova), "Etapa adicionada", () => setNova(""));
          }}
        >
          <label className="campo">
            <span>Nova etapa (entra antes do fechamento)</span>
            <input value={nova} maxLength={60} required onChange={(ev) => setNova(ev.target.value)} placeholder="Ex.: Visita técnica" />
          </label>
          <button type="submit" className="btn" disabled={ocupado}><Icone nome="mais" tamanho={16} /> Adicionar etapa</button>
        </form>

        {msg?.erro && <p className="aviso aviso-erro" role="alert">{msg.erro}</p>}
        {msg?.ok && <p className="aviso aviso-ok" role="status">{msg.ok}</p>}
        <div className="acoes-linha"><button type="button" className="btn-link" onClick={onFechar}>Fechar</button></div>
      </div>
    </Modal>
  );
}
