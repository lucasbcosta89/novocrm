"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatarData, formatarDataHora } from "@/lib/formato";
import { ROTULO_PRIORIDADE, ROTULO_RESULTADO, ROTULO_STATUS_OPORTUNIDADE, ROTULO_TIPO_OPORTUNIDADE } from "@/lib/rotulos";
import { PRIORIDADES, STATUS_OPORTUNIDADE, TIPOS_OPORTUNIDADE } from "@/lib/validacao";
import type { Acao, CartaoKanban, OportunidadeDetalhe } from "@/server/oportunidades";
import { api, BuscaProdutos, ConfirmarModal, Modal, ResultadoModal, SelectEstado } from "./comum";

type Rep = { id: string; nome: string };
type Status = (typeof STATUS_OPORTUNIDADE)[number];
type AcaoEdit = { id: string | null; descricao: string; status: Status; prazo: string; data_entrega: string; observacoes: string };

const paraEdicao = (a: Acao): AcaoEdit => ({
  id: a.id, descricao: a.descricao, status: a.status as Status, prazo: a.prazo ?? "", data_entrega: a.data_entrega ?? "", observacoes: a.observacoes ?? "",
});

/** Quadro de detalhes: edita cadastro, status (regra de conclusão), produtos e ações; exclui a oportunidade. */
export function DetalheOportunidade({
  id,
  representadas,
  onFechar,
  onAtualizada,
  onExcluida,
}: {
  id: string;
  representadas: Rep[];
  onFechar: () => void;
  onAtualizada: (c: CartaoKanban) => void;
  onExcluida: (id: string) => void;
}) {
  const [o, setO] = useState<OportunidadeDetalhe | null>(null);
  const [acoes, setAcoes] = useState<AcaoEdit[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  function aplicar(d: OportunidadeDetalhe, msg?: string) {
    setO(d);
    setAcoes(d.acoes.map(paraEdicao));
    onAtualizada(d);
    setAviso(msg ?? null);
  }

  useEffect(() => {
    api<OportunidadeDetalhe>(`/api/oportunidades/${id}`)
      .then((d) => {
        setO(d);
        setAcoes(d.acoes.map(paraEdicao));
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha ao carregar"));
  }, [id]);

  /** Executa uma alteração e recarrega o detalhe (fonte da verdade = servidor). */
  async function executar(fn: () => Promise<unknown>, msg: string) {
    setErro(null);
    setOcupado(true);
    try {
      await fn();
      aplicar(await api<OportunidadeDetalhe>(`/api/oportunidades/${id}`), msg);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setOcupado(false);
    }
  }

  if (!o) {
    return (
      <Modal titulo="Oportunidade" onFechar={onFechar}>
        {erro ? <p className="aviso aviso-erro">{erro}</p> : <p className="dica">Carregando…</p>}
      </Modal>
    );
  }

  const salvarCadastro = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    void executar(
      () => api(`/api/oportunidades/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          tipo: fd.get("tipo"), titulo: fd.get("titulo"), cidade: fd.get("cidade"), estado: fd.get("estado"),
          representada_id: fd.get("representada_id"), prioridade: fd.get("prioridade"),
          valor_estimado: fd.get("valor_estimado"), descricao: fd.get("descricao"),
        }),
      }),
      "Dados salvos",
    );
  };

  const mudarStatus = (status: Status) => {
    if (status === o.status) return;
    if (status === "concluido") return setConcluindo(true); // mesma regra da Fase 4b
    void executar(() => api(`/api/oportunidades/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }), "Status atualizado");
  };

  const salvarAcao = (a: AcaoEdit) => {
    const corpo = JSON.stringify({ descricao: a.descricao, status: a.status, prazo: a.prazo, data_entrega: a.data_entrega, observacoes: a.observacoes });
    void executar(
      () => (a.id ? api(`/api/acoes/${a.id}`, { method: "PATCH", body: corpo }) : api(`/api/oportunidades/${id}/acoes`, { method: "POST", body: corpo })),
      a.id ? "Ação salva" : "Ação adicionada",
    );
  };
  const excluirAcao = (a: AcaoEdit, i: number) => {
    if (!a.id) return setAcoes(acoes.filter((_, j) => j !== i)); // linha nova ainda não salva
    void executar(() => api(`/api/acoes/${a.id}`, { method: "DELETE" }), "Ação excluída");
  };
  const mudarAcao = (i: number, campos: Partial<AcaoEdit>) => setAcoes((xs) => xs.map((a, j) => (j === i ? { ...a, ...campos } : a)));

  return (
    <Modal titulo={o.titulo} onFechar={onFechar}>
      <div className="grade-1 detalhe-op">
        <p className="dica">
          <span className={`etiqueta etiqueta-${o.tipo}`}>{ROTULO_TIPO_OPORTUNIDADE[o.tipo]}</span>{" "}
          {o.representada?.nome ?? "Sem representada"}
          {o.cliente && <> · Cliente: <Link href={`/app/clientes/${o.cliente.id}/oportunidades/${o.id}`}>{o.cliente.nome}</Link></>}
          {" · "}criada em {formatarDataHora(o.criado_em)}
        </p>
        {erro && <p className="aviso aviso-erro">{erro}</p>}
        {aviso && <p className="aviso aviso-ok">{aviso}</p>}

        {/* status geral */}
        <div className="inline">
          <label className="campo">
            <span>Status geral</span>
            <select value={o.status} disabled={ocupado} onChange={(e) => mudarStatus(e.target.value as Status)}>
              {STATUS_OPORTUNIDADE.map((s) => <option key={s} value={s}>{ROTULO_STATUS_OPORTUNIDADE[s]}</option>)}
            </select>
          </label>
          {o.status === "concluido" && o.resultado && (
            <p className="resultado-op">
              <span className={`etiqueta ${o.resultado === "ganhou" ? "etiqueta-recebida" : "etiqueta-atrasada"}`}>{ROTULO_RESULTADO[o.resultado]}</span>
              {o.data_conclusao && <span className="dica"> em {formatarData(o.data_conclusao)}</span>}
              {o.observacoes_resultado && <span className="anotacao"> — {o.observacoes_resultado}</span>}
            </p>
          )}
        </div>

        {/* cadastro */}
        <details open>
          <summary><strong>Dados da oportunidade</strong></summary>
          <form onSubmit={salvarCadastro} className="grade" key={o.atualizado_em}>
            <label className="campo"><span>Nome *</span><input name="titulo" required minLength={2} defaultValue={o.titulo} /></label>
            <label className="campo">
              <span>Tipo</span>
              <select name="tipo" defaultValue={o.tipo}>
                {TIPOS_OPORTUNIDADE.map((t) => <option key={t} value={t}>{ROTULO_TIPO_OPORTUNIDADE[t]}</option>)}
              </select>
            </label>
            <label className="campo"><span>Cidade</span><input name="cidade" defaultValue={o.cidade ?? ""} /></label>
            <SelectEstado defaultValue={o.estado} />
            <label className="campo">
              <span>Representada *</span>
              <select name="representada_id" required defaultValue={o.representada_id ?? ""}>
                <option value="" disabled>Selecione…</option>
                {representadas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Prioridade</span>
              <select name="prioridade" defaultValue={o.prioridade}>
                {PRIORIDADES.map((p) => <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>)}
              </select>
            </label>
            <label className="campo"><span>Valor estimado (R$)</span><input name="valor_estimado" type="number" step="0.01" min="0" defaultValue={o.valor_estimado ?? ""} /></label>
            <label className="campo campo-largo"><span>Descrição</span><textarea name="descricao" rows={2} defaultValue={o.descricao ?? ""} /></label>
            <div className="acoes"><button className="btn" type="submit" disabled={ocupado}>Salvar dados</button>
              <span className="dica"> Trocar a representada remove os produtos da marca anterior.</span></div>
          </form>
        </details>

        {/* produtos */}
        <h3>Produtos</h3>
        {o.produtos.length > 0 ? (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead><tr><th>SKU</th><th>Produto</th><th>Quantidade</th><th></th></tr></thead>
              <tbody>
                {o.produtos.map((p) => (
                  <tr key={p.id}>
                    <td><code>{p.produto?.sku}</code></td>
                    <td>{p.produto?.nome}</td>
                    <td>
                      <input className="input-num" type="number" min={0.001} step="any" defaultValue={p.quantidade} aria-label={`Quantidade de ${p.produto?.nome}`}
                        onBlur={(e) => {
                          const q = Number(e.target.value);
                          if (q > 0 && q !== Number(p.quantidade)) {
                            void executar(() => api(`/api/oportunidades/${id}/produtos`, { method: "POST", body: JSON.stringify({ produto_id: p.produto_id, quantidade: q }) }), "Quantidade salva");
                          }
                        }} />
                    </td>
                    <td>
                      <button className="btn-link perigo" type="button" disabled={ocupado}
                        onClick={() => void executar(() => api(`/api/oportunidades/${id}/produtos/${p.produto_id}`, { method: "DELETE" }), "Produto removido")}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dica">Nenhum produto.</p>
        )}
        <BuscaProdutos
          representadaId={o.representada_id ?? ""}
          escolhidos={o.produtos.map((p) => p.produto_id)}
          onAdicionar={(p) => void executar(() => api(`/api/oportunidades/${id}/produtos`, { method: "POST", body: JSON.stringify({ produto_id: p.id, quantidade: 1 }) }), "Produto adicionado")}
        />

        {/* ações */}
        <div className="cabecalho">
          <h3>Ações necessárias</h3>
          <button className="btn btn-peq" type="button"
            onClick={() => setAcoes([...acoes, { id: null, descricao: "", status: "nao_iniciado", prazo: "", data_entrega: "", observacoes: "" }])}>
            Adicionar Ação Necessária
          </button>
        </div>
        {acoes.length === 0 ? (
          <p className="dica">Nenhuma ação.</p>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela tabela-form">
              <thead><tr><th>Ação *</th><th>Status</th><th>Prazo limite</th><th>Data de entrega</th><th>Observações</th><th></th></tr></thead>
              <tbody>
                {acoes.map((a, i) => (
                  <tr key={a.id ?? `nova-${i}`}>
                    <td><input value={a.descricao} aria-label="Ação" onChange={(e) => mudarAcao(i, { descricao: e.target.value })} /></td>
                    <td>
                      <select value={a.status} aria-label="Status da ação" onChange={(e) => mudarAcao(i, { status: e.target.value as Status })}>
                        {STATUS_OPORTUNIDADE.map((s) => <option key={s} value={s}>{ROTULO_STATUS_OPORTUNIDADE[s]}</option>)}
                      </select>
                    </td>
                    <td><input type="date" value={a.prazo} aria-label="Prazo limite" onChange={(e) => mudarAcao(i, { prazo: e.target.value })} /></td>
                    <td><input type="date" value={a.data_entrega} aria-label="Data de entrega" onChange={(e) => mudarAcao(i, { data_entrega: e.target.value })} /></td>
                    <td><input value={a.observacoes} aria-label="Observações" onChange={(e) => mudarAcao(i, { observacoes: e.target.value })} /></td>
                    <td className="acoes-linha">
                      <button className="btn btn-peq" type="button" disabled={ocupado || a.descricao.trim().length < 2} onClick={() => salvarAcao(a)}>
                        {a.id ? "Salvar" : "Adicionar"}
                      </button>
                      <button className="btn-link perigo" type="button" disabled={ocupado} onClick={() => excluirAcao(a, i)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="acoes-linha zona-perigo">
          <button className="btn-perigo" type="button" onClick={() => setExcluindo(true)}>Excluir</button>
          <span className="dica">Exclui a oportunidade, seus produtos e ações.</span>
        </div>
      </div>

      {concluindo && (
        <ResultadoModal
          oportunidade={o}
          onFechar={() => setConcluindo(false)}
          onConcluida={() => {
            setConcluindo(false);
            void executar(async () => undefined, "Oportunidade concluída");
          }}
        />
      )}
      {excluindo && (
        <ConfirmarModal
          titulo="Excluir oportunidade"
          texto={`Excluir “${o.titulo}”? Esta ação não pode ser desfeita: os produtos e as ações vinculados também serão removidos.`}
          rotulo="Excluir definitivamente"
          onFechar={() => setExcluindo(false)}
          onConfirmar={async () => {
            await api(`/api/oportunidades/${id}`, { method: "DELETE" }); // cascade remove produtos e ações
            onExcluida(id);
          }}
        />
      )}
    </Modal>
  );
}
