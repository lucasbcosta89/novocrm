"use client";

import { useRef } from "react";
import { Icone } from "@/components/icones";
import { ETAPAS_MODELO, ROTULO_MODELO_FUNIL } from "@/lib/funis";
import { MODELOS_FUNIL } from "@/lib/validacao";
import { criarFunilAction } from "./actions";

/** Botão "Criar Funil de Vendas" + popup com nome e modelo (as etapas do modelo aparecem como dica). */
export function CriarFunil() {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn" onClick={() => ref.current?.showModal()}>
        <Icone nome="mais" tamanho={16} /> Criar Funil de Vendas
      </button>
      <dialog ref={ref} className="modal modal-estreito" aria-labelledby="titulo-criar-funil" onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <form action={criarFunilAction} className="grade-1">
          <div className="cabecalho">
            <h2 id="titulo-criar-funil" className="titulo-icone"><Icone nome="funil" tamanho={20} /> Criar Funil de Vendas</h2>
            <button type="button" className="btn-link" onClick={() => ref.current?.close()} aria-label="Fechar">
              <Icone nome="fechar" tamanho={16} />
            </button>
          </div>
          <label className="campo">
            <span>Nome do Funil *</span>
            <input name="nome" required maxLength={80} placeholder="Ex.: Vendas 2027" autoFocus />
          </label>
          <label className="campo">
            <span>Modelo</span>
            <select name="modelo" defaultValue="vendas">
              {MODELOS_FUNIL.map((m) => <option key={m} value={m}>{ROTULO_MODELO_FUNIL[m]}</option>)}
            </select>
          </label>
          <ul className="dica lista-modelos">
            {MODELOS_FUNIL.map((m) => (
              <li key={m}><strong>{ROTULO_MODELO_FUNIL[m]}:</strong> {ETAPAS_MODELO[m].join(" → ")}</li>
            ))}
          </ul>
          <div className="acoes-linha">
            <button className="btn" type="submit"><Icone nome="check" tamanho={16} /> Criar funil</button>
            <button type="button" className="btn-link" onClick={() => ref.current?.close()}>Cancelar</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
