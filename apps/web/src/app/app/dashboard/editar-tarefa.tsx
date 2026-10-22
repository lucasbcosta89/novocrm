"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icone } from "@/components/icones";
import { ROTULO_STATUS_ACAO } from "@/lib/rotulos";
import { STATUS_ACAO } from "@/lib/validacao";
import { api, Modal } from "../oportunidades/comum";

type Acao = {
  id: string; descricao: string; responsavel: string | null; prazo: string | null; data_entrega: string | null;
  observacoes: string | null; status: string; oportunidade: { id: string; titulo: string } | null;
};
type Tarefa = { id: string; titulo: string; data: string | null; concluida: boolean; cliente: { id: string; nome: string } | null };

/**
 * Popup de edição de tarefa a partir do quadro de alertas (sem sair do dashboard):
 * sub-tarefa (plano_acao) ou tarefa avulsa (tabela tarefas). Ao salvar, o dashboard recarrega.
 */
export function EditarTarefa({ tipo, id, rotaOrigem, onFechar, onSalva }: {
  tipo: "subtarefa" | "tarefa"; id: string; rotaOrigem: string | null; onFechar: () => void; onSalva: () => void;
}) {
  const url = tipo === "subtarefa" ? `/api/acoes/${id}` : `/api/tarefas/${id}`;
  const [item, setItem] = useState<Acao | Tarefa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    api<Acao | Tarefa>(url)
      .then((r) => ativo && setItem(r))
      .catch((e: unknown) => ativo && setErro(e instanceof Error ? e.message : "Falha ao carregar a tarefa"));
    return () => {
      ativo = false;
    };
  }, [url]);

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const corpo =
      tipo === "subtarefa"
        ? {
            descricao: fd.get("descricao"), responsavel: fd.get("responsavel"), prazo: fd.get("prazo"),
            status: fd.get("status"), data_entrega: fd.get("data_entrega"), observacoes: fd.get("observacoes"),
          }
        : { titulo: fd.get("titulo"), data: fd.get("data"), concluida: fd.get("concluida") === "on" };
    setSalvando(true);
    setErro(null);
    try {
      await api(url, { method: "PATCH", body: JSON.stringify(corpo) });
      onSalva();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao salvar");
      setSalvando(false);
    }
  }

  const acao = tipo === "subtarefa" ? (item as Acao | null) : null;
  const tarefa = tipo === "tarefa" ? (item as Tarefa | null) : null;

  return (
    <Modal titulo={tipo === "subtarefa" ? "Editar sub-tarefa" : "Editar tarefa"} onFechar={onFechar} largo={false}>
      {!item ? (
        erro ? <p className="aviso aviso-erro" role="alert">{erro}</p> : <div className="esqueleto esqueleto-lista" aria-busy="true" />
      ) : (
        <form onSubmit={salvar} className="grade-1">
          {acao && (
            <>
              {acao.oportunidade && <p className="dica">Oportunidade: <strong>{acao.oportunidade.titulo}</strong></p>}
              <label className="campo"><span>Descrição *</span><input name="descricao" required minLength={2} maxLength={1000} defaultValue={acao.descricao} /></label>
              <div className="grade">
                <label className="campo"><span>Prazo</span><input name="prazo" type="date" defaultValue={acao.prazo ?? ""} /></label>
                <label className="campo">
                  <span>Status</span>
                  <select name="status" defaultValue={acao.status}>
                    {STATUS_ACAO.map((s) => <option key={s} value={s}>{ROTULO_STATUS_ACAO[s] ?? s}</option>)}
                  </select>
                </label>
                <label className="campo"><span>Data de entrega</span><input name="data_entrega" type="date" defaultValue={acao.data_entrega ?? ""} /></label>
                <label className="campo"><span>Responsável</span><input name="responsavel" maxLength={120} defaultValue={acao.responsavel ?? ""} /></label>
              </div>
              <label className="campo"><span>Observações</span><textarea name="observacoes" rows={3} maxLength={2000} defaultValue={acao.observacoes ?? ""} /></label>
            </>
          )}
          {tarefa && (
            <>
              {tarefa.cliente && <p className="dica">Cliente: <strong>{tarefa.cliente.nome}</strong></p>}
              <label className="campo"><span>Título *</span><input name="titulo" required minLength={2} maxLength={300} defaultValue={tarefa.titulo} /></label>
              <label className="campo"><span>Data</span><input name="data" type="date" defaultValue={tarefa.data ?? ""} /></label>
              <label className="check"><input type="checkbox" name="concluida" defaultChecked={tarefa.concluida} /> Concluída</label>
            </>
          )}
          {erro && <p className="aviso aviso-erro" role="alert">{erro}</p>}
          <div className="acoes-linha">
            <button className="btn" type="submit" disabled={salvando}><Icone nome="check" tamanho={16} /> {salvando ? "Salvando…" : "Salvar"}</button>
            <button className="btn-link" type="button" onClick={onFechar}>Cancelar</button>
            {rotaOrigem && <Link className="btn-link" href={rotaOrigem}><Icone nome="link" tamanho={16} /> Abrir na origem</Link>}
          </div>
        </form>
      )}
    </Modal>
  );
}
