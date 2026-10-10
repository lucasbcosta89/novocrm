"use client";

import { useEffect, useRef, useState } from "react";
import { formatarMoeda } from "@/lib/formato";
import { UFS } from "@/lib/ufs";
import type { CartaoKanban } from "@/server/oportunidades";
import type { Produto } from "@/server/produtos";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => ({}))) as T & { erro?: string };
  if (!res.ok) throw new Error(json.erro ?? `Erro ${res.status}`);
  return json;
}

export function Modal({ titulo, onFechar, children, largo = true }: { titulo: string; onFechar: () => void; children: React.ReactNode; largo?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <dialog
      ref={(el) => {
        ref.current = el;
        if (el && !el.open) el.showModal();
      }}
      className={`modal ${largo ? "modal-largo" : ""}`}
      onClose={onFechar}
    >
      <div className="cabecalho">
        <h2>{titulo}</h2>
        <button type="button" className="btn-link" aria-label="Fechar" onClick={() => ref.current?.close()}>✕</button>
      </div>
      {children}
    </dialog>
  );
}

/** Busca por SKU/nome no catálogo da representada (só produtos ativos ainda não escolhidos). */
export function BuscaProdutos({ representadaId, escolhidos, onAdicionar }: { representadaId: string; escolhidos: string[]; onAdicionar: (p: Produto) => void }) {
  const [catalogo, setCatalogo] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  useEffect(() => {
    let ativo = true;
    if (representadaId) {
      api<Produto[]>(`/api/representadas/${representadaId}/produtos`)
        .then((ps) => ativo && setCatalogo(ps))
        .catch(() => ativo && setCatalogo([]));
    }
    return () => {
      ativo = false;
    };
  }, [representadaId]);

  const termo = busca.trim().toLowerCase();
  const resultados = termo && representadaId
    ? catalogo.filter((p) => p.ativo && !escolhidos.includes(p.id) && (p.sku.toLowerCase().includes(termo) || p.nome.toLowerCase().includes(termo))).slice(0, 8)
    : [];
  return (
    <>
      <label className="campo">
        <span>Buscar produto por SKU ou nome {representadaId ? "" : "(selecione a representada)"}</span>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} disabled={!representadaId} placeholder="Ex.: A1 ou caneta" />
      </label>
      {resultados.length > 0 && (
        <ul className="lista">
          {resultados.map((p) => (
            <li key={p.id}>
              <span><code>{p.sku}</code> {p.nome} · {formatarMoeda(p.preco)}</span>
              <button className="btn btn-peq" type="button" onClick={() => { onAdicionar(p); setBusca(""); }}>Adicionar</button>
            </li>
          ))}
        </ul>
      )}
      {termo && representadaId && resultados.length === 0 && <p className="dica">Nenhum produto encontrado nesta representada.</p>}
    </>
  );
}

/** Regra de conclusão: Ganhou/Perdeu; Observações só em Ganhou. */
export function ResultadoModal({
  oportunidade,
  onFechar,
  onConcluida,
}: {
  oportunidade: { id: string; titulo: string };
  onFechar: () => void;
  onConcluida: (c: Pick<CartaoKanban, "resultado" | "observacoes_resultado" | "data_conclusao">) => void;
}) {
  const [resultado, setResultado] = useState<"" | "ganhou" | "perdeu">("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function concluir() {
    setEnviando(true);
    setErro(null);
    try {
      const r = await api<CartaoKanban>(`/api/oportunidades/${oportunidade.id}/concluir`, {
        method: "POST",
        body: JSON.stringify({ resultado, observacoes_resultado: resultado === "ganhou" ? obs : "" }),
      });
      onConcluida({ resultado: r.resultado, observacoes_resultado: r.observacoes_resultado, data_conclusao: r.data_conclusao });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao concluir");
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Resultado da Oportunidade" onFechar={onFechar} largo={false}>
      <div className="grade-1">
        <p className="dica">{oportunidade.titulo}</p>
        <label className="campo">
          <span>Resultado</span>
          <select value={resultado} onChange={(e) => setResultado(e.target.value as "ganhou" | "perdeu")}>
            <option value="" disabled>Selecione…</option>
            <option value="ganhou">Ganhou</option>
            <option value="perdeu">Perdeu</option>
          </select>
        </label>
        {resultado === "ganhou" && (
          <label className="campo"><span>Observações</span><textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} /></label>
        )}
        {erro && <p className="aviso aviso-erro">{erro}</p>}
        <div className="acoes-linha">
          {resultado && <button className="btn" type="button" onClick={concluir} disabled={enviando}>{enviando ? "Concluindo…" : "Concluir"}</button>}
          <button className="btn-link" type="button" onClick={onFechar}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

export function ConfirmarModal({ titulo, texto, rotulo, onConfirmar, onFechar }: {
  titulo: string; texto: string; rotulo: string; onConfirmar: () => Promise<void>; onFechar: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Modal titulo={titulo} onFechar={onFechar} largo={false}>
      <div className="grade-1">
        <p>{texto}</p>
        {erro && <p className="aviso aviso-erro">{erro}</p>}
        <div className="acoes-linha">
          <button className="btn-perigo" type="button" disabled={enviando}
            onClick={async () => {
              setEnviando(true);
              try {
                await onConfirmar();
              } catch (e) {
                setErro(e instanceof Error ? e.message : "Falha");
                setEnviando(false);
              }
            }}>
            {enviando ? "Excluindo…" : rotulo}
          </button>
          <button className="btn-link" type="button" onClick={onFechar}>Cancelar</button>
        </div>
      </div>
    </Modal>
  );
}

/** Menu com todos os estados do Brasil. */
export function SelectEstado({ name = "estado", defaultValue }: { name?: string; defaultValue?: string | null }) {
  return (
    <label className="campo">
      <span>Estado</span>
      <select name={name} defaultValue={defaultValue ?? ""}>
        <option value="">Selecione…</option>
        {UFS.map(([sigla, nome]) => <option key={sigla} value={sigla}>{nome} ({sigla})</option>)}
      </select>
    </label>
  );
}
