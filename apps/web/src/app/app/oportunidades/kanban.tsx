"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { formatarMoeda } from "@/lib/formato";
import { resumoOportunidades } from "@/lib/oportunidades";
import { ROTULO_PRIORIDADE, ROTULO_RESULTADO, ROTULO_STATUS_OPORTUNIDADE, ROTULO_TIPO_OPORTUNIDADE } from "@/lib/rotulos";
import { PRIORIDADES, STATUS_OPORTUNIDADE } from "@/lib/validacao";
import type { CartaoKanban } from "@/server/oportunidades";
import type { Produto } from "@/server/produtos";
import { api, BuscaProdutos, Modal, ResultadoModal, SelectEstado } from "./comum";
import { DetalheOportunidade } from "./detalhe";

type Rep = { id: string; nome: string };
type Status = (typeof STATUS_OPORTUNIDADE)[number];
type Agrupar = "nenhum" | "representada" | "cidade" | "estado" | "prioridade";
type Filtros = { representada: string; cidade: string; estado: string; prioridade: string; status: string };

const FILTROS_VAZIOS: Filtros = { representada: "", cidade: "", estado: "", prioridade: "", status: "" };

const valorGrupo = (o: CartaoKanban, g: Agrupar) =>
  g === "representada" ? (o.representada?.nome ?? "Sem representada")
  : g === "cidade" ? (o.cidade ?? "Sem cidade")
  : g === "estado" ? (o.estado ?? "Sem estado")
  : g === "prioridade" ? (ROTULO_PRIORIDADE[o.prioridade] ?? o.prioridade)
  : "";

export function Kanban({ inicial, representadas }: { inicial: CartaoKanban[]; representadas: Rep[] }) {
  const [itens, setItens] = useState(inicial);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [agrupar, setAgrupar] = useState<Agrupar>("nenhum");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [concluir, setConcluir] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cidades = useMemo(() => [...new Set(itens.map((o) => o.cidade).filter(Boolean) as string[])].sort(), [itens]);
  const estados = useMemo(() => [...new Set(itens.map((o) => o.estado).filter(Boolean) as string[])].sort(), [itens]);

  const visiveis = itens.filter(
    (o) =>
      (!filtros.representada || o.representada_id === filtros.representada) &&
      (!filtros.cidade || o.cidade === filtros.cidade) &&
      (!filtros.estado || o.estado === filtros.estado) &&
      (!filtros.prioridade || o.prioridade === filtros.prioridade) &&
      (!filtros.status || o.status === filtros.status),
  );
  const grupos =
    agrupar === "nenhum"
      ? [{ nome: "", itens: visiveis }]
      : [...new Set(visiveis.map((o) => valorGrupo(o, agrupar)))].sort().map((nome) => ({ nome, itens: visiveis.filter((o) => valorGrupo(o, agrupar) === nome) }));
  const resumo = resumoOportunidades(itens);

  const atualizarLocal = (id: string, campos: Partial<CartaoKanban>) => setItens((xs) => xs.map((o) => (o.id === id ? { ...o, ...campos } : o)));

  /** Mover de coluna: "Concluído" pede o resultado antes de gravar; os demais salvam na hora (otimista). */
  async function mover(id: string, status: Status) {
    const atual = itens.find((o) => o.id === id);
    if (!atual || atual.status === status) return;
    if (status === "concluido") {
      setConcluir(id);
      return;
    }
    setErro(null);
    atualizarLocal(id, { status, resultado: null, observacoes_resultado: null, data_conclusao: null });
    try {
      await api(`/api/oportunidades/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    } catch (e) {
      atualizarLocal(id, { status: atual.status, resultado: atual.resultado, observacoes_resultado: atual.observacoes_resultado, data_conclusao: atual.data_conclusao });
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
    }
  }

  const filtro = (campo: keyof Filtros, rotulo: string, opcoes: { v: string; r: string }[], todos = "Todas") => (
    <label className="campo">
      <span>{rotulo}</span>
      <select value={filtros[campo]} onChange={(e) => setFiltros({ ...filtros, [campo]: e.target.value })}>
        <option value="">{todos}</option>
        {opcoes.map((o) => <option key={o.v} value={o.v}>{o.r}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <div className="kanban-barra card">
        {filtro("representada", "Representada", representadas.map((r) => ({ v: r.id, r: r.nome })))}
        {filtro("cidade", "Cidade", cidades.map((c) => ({ v: c, r: c })))}
        {filtro("estado", "Estado", estados.map((uf) => ({ v: uf, r: uf })), "Todos")}
        {filtro("prioridade", "Prioridade", PRIORIDADES.map((p) => ({ v: p, r: ROTULO_PRIORIDADE[p] ?? p })))}
        {filtro("status", "Status", STATUS_OPORTUNIDADE.map((s) => ({ v: s, r: ROTULO_STATUS_OPORTUNIDADE[s] ?? s })), "Todos")}
        <label className="campo">
          <span>Agrupar por</span>
          <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupar)}>
            <option value="nenhum">Nenhum</option>
            <option value="representada">Representada</option>
            <option value="cidade">Cidade</option>
            <option value="estado">Estado</option>
            <option value="prioridade">Prioridade</option>
          </select>
        </label>
        <div className="kanban-acoes">
          {Object.values(filtros).some(Boolean) && (
            <button className="btn-link" type="button" onClick={() => setFiltros(FILTROS_VAZIOS)}>Limpar filtros</button>
          )}
          <button className="btn" type="button" onClick={() => setNovo(true)} disabled={representadas.length === 0}
            title={representadas.length === 0 ? "Cadastre uma representada primeiro" : undefined}>
            Nova Oportunidade
          </button>
        </div>
      </div>
      {erro && <p className="aviso aviso-erro">{erro}</p>}

      {grupos.map((g) => (
        <section key={g.nome || "todos"} className="kanban-grupo">
          {g.nome && <h2 className="kanban-grupo-titulo">{g.nome} <span className="dica">({g.itens.length})</span></h2>}
          <div className="kanban">
            {STATUS_OPORTUNIDADE.map((status) => {
              const coluna = g.itens.filter((o) => o.status === status);
              const alvo = `${g.nome}|${status}`;
              return (
                <div
                  key={status}
                  className={`kanban-coluna coluna-${status} ${sobre === alvo ? "sobre" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setSobre(alvo);
                  }}
                  onDragLeave={() => setSobre((s) => (s === alvo ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setSobre(null);
                    const id = e.dataTransfer.getData("text/plain") || arrastando;
                    if (id) void mover(id, status);
                  }}
                >
                  <h3>{ROTULO_STATUS_OPORTUNIDADE[status]} <span className="dica">{coluna.length}</span></h3>
                  {coluna.map((o) => (
                    <Cartao key={o.id} o={o} onDrag={setArrastando} onMover={mover} onAbrir={setDetalhe} />
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="card kanban-log">
        <h2>Log de oportunidades</h2>
        <dl className="resumo">
          <div><dt>Total inseridas</dt><dd>{resumo.total}</dd></div>
          <div><dt>Ganhas</dt><dd className="txt-ok">{resumo.ganhas}</dd></div>
          <div><dt>Perdidas</dt><dd className="atrasada">{resumo.perdidas}</dd></div>
          <div><dt>Aproveitamento</dt><dd>{String(resumo.aproveitamento).replace(".", ",")}%</dd></div>
        </dl>
        <p className="dica">Aproveitamento = ganhas ÷ (ganhas + perdidas) × 100.</p>
      </section>

      {novo && (
        <NovaOportunidade
          representadas={representadas}
          onFechar={() => setNovo(false)}
          onCriada={(o) => {
            setItens((xs) => [o, ...xs]);
            setNovo(false);
            if (o.status === "concluido") setConcluir(o.id);
          }}
        />
      )}
      {concluir && (
        <ResultadoModal
          oportunidade={itens.find((o) => o.id === concluir)!}
          onFechar={() => setConcluir(null)}
          onConcluida={(campos) => {
            atualizarLocal(concluir, { status: "concluido", ...campos });
            setConcluir(null);
          }}
        />
      )}
      {detalhe && (
        <DetalheOportunidade
          id={detalhe}
          representadas={representadas}
          onFechar={() => setDetalhe(null)}
          onAtualizada={(c) => setItens((xs) => xs.map((o) => (o.id === c.id ? c : o)))}
          onExcluida={(id) => {
            setItens((xs) => xs.filter((o) => o.id !== id));
            setDetalhe(null);
          }}
        />
      )}
    </>
  );
}

function Cartao({ o, onDrag, onMover, onAbrir }: {
  o: CartaoKanban; onDrag: (id: string | null) => void; onMover: (id: string, s: Status) => void; onAbrir: (id: string) => void;
}) {
  const feitas = o.acoes.filter((a) => a.status === "concluido").length;
  const fimArraste = useRef(0);
  return (
    <article
      className={`kanban-cartao ${o.resultado ? `resultado-${o.resultado}` : ""}`}
      draggable
      role="button"
      tabIndex={0}
      aria-label={`Abrir detalhes de ${o.titulo}`}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", o.id);
        e.dataTransfer.effectAllowed = "move";
        onDrag(o.id);
      }}
      onDragEnd={() => {
        onDrag(null);
        fimArraste.current = Date.now();
      }}
      // clique simples abre o detalhe; ignora o "clique" que alguns navegadores disparam ao soltar um arraste
      onClick={() => {
        if (Date.now() - fimArraste.current > 300) onAbrir(o.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onAbrir(o.id);
      }}
    >
      <div className="cartao-topo">
        <span className={`etiqueta etiqueta-${o.tipo}`}>{ROTULO_TIPO_OPORTUNIDADE[o.tipo]}</span>
        <span className="dica">{ROTULO_PRIORIDADE[o.prioridade] ?? o.prioridade}</span>
      </div>
      <strong>{o.titulo}</strong>
      <span className="dica">{o.representada?.nome ?? "Sem representada"}</span>
      {o.cliente && (
        <span className="dica">
          Cliente: <Link href={`/app/clientes/${o.cliente.id}`} onClick={(e) => e.stopPropagation()}>{o.cliente.nome}</Link>
        </span>
      )}
      {(o.cidade || o.estado) && <span className="dica">{[o.cidade, o.estado].filter(Boolean).join("/")}</span>}
      {o.valor_estimado != null && <span className="dica">{formatarMoeda(Number(o.valor_estimado))}</span>}
      <span className="dica">{o.produtos.length} produto(s) · ações {feitas}/{o.acoes.length}</span>
      {o.resultado && (
        <span className={`etiqueta ${o.resultado === "ganhou" ? "etiqueta-recebida" : "etiqueta-atrasada"}`} title={o.observacoes_resultado ?? undefined}>
          {ROTULO_RESULTADO[o.resultado]}
        </span>
      )}
      {/* alternativa ao arrastar (teclado/celular) */}
      <select aria-label={`Mover ${o.titulo}`} value={o.status} onClick={(e) => e.stopPropagation()} onChange={(e) => onMover(o.id, e.target.value as Status)}>
        {STATUS_OPORTUNIDADE.map((s) => <option key={s} value={s}>{ROTULO_STATUS_OPORTUNIDADE[s]}</option>)}
      </select>
    </article>
  );
}

type AcaoForm = { descricao: string; status: Status; prazo: string; data_entrega: string; observacoes: string };

function NovaOportunidade({ representadas, onFechar, onCriada }: { representadas: Rep[]; onFechar: () => void; onCriada: (o: CartaoKanban) => void }) {
  const [repId, setRepId] = useState("");
  const [selecionados, setSelecionados] = useState<{ produto: Produto; quantidade: number }[]>([]);
  const [acoes, setAcoes] = useState<AcaoForm[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const fd = new FormData(e.currentTarget);
    setEnviando(true);
    try {
      const criada = await api<CartaoKanban>("/api/oportunidades", {
        method: "POST",
        body: JSON.stringify({
          titulo: fd.get("titulo"), cidade: fd.get("cidade"), estado: fd.get("estado"), representada_id: repId,
          prioridade: fd.get("prioridade"), status: fd.get("status"),
          produtos: selecionados.map((s) => ({ produto_id: s.produto.id, quantidade: s.quantidade })),
          acoes: acoes.filter((a) => a.descricao.trim()),
        }),
      });
      onCriada(criada);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setEnviando(false);
    }
  }

  const mudarAcao = (i: number, campos: Partial<AcaoForm>) => setAcoes((xs) => xs.map((a, j) => (j === i ? { ...a, ...campos } : a)));

  return (
    <Modal titulo="Nova Oportunidade" onFechar={onFechar}>
      <form onSubmit={salvar} className="grade-1">
        <div className="grade">
          <label className="campo"><span>Nome *</span><input name="titulo" required minLength={2} /></label>
          <label className="campo"><span>Cidade</span><input name="cidade" /></label>
          <SelectEstado />
          <label className="campo">
            <span>Representada *</span>
            <select required value={repId} onChange={(e) => { setRepId(e.target.value); setSelecionados([]); }}>
              <option value="" disabled>Selecione…</option>
              {representadas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Prioridade</span>
            <select name="prioridade" defaultValue="media">
              {PRIORIDADES.map((p) => <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>Status geral</span>
            <select name="status" defaultValue="nao_iniciado">
              {STATUS_OPORTUNIDADE.map((s) => <option key={s} value={s}>{ROTULO_STATUS_OPORTUNIDADE[s]}</option>)}
            </select>
          </label>
        </div>

        <h3>Produtos</h3>
        <BuscaProdutos
          representadaId={repId}
          escolhidos={selecionados.map((s) => s.produto.id)}
          onAdicionar={(p) => setSelecionados([...selecionados, { produto: p, quantidade: 1 }])}
        />
        {selecionados.length > 0 && (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead><tr><th>SKU</th><th>Produto</th><th>Quantidade</th><th></th></tr></thead>
              <tbody>
                {selecionados.map((s, i) => (
                  <tr key={s.produto.id}>
                    <td><code>{s.produto.sku}</code></td>
                    <td>{s.produto.nome}</td>
                    <td>
                      <input className="input-num" type="number" min={0.001} step="any" value={s.quantidade} aria-label={`Quantidade de ${s.produto.nome}`}
                        onChange={(e) => setSelecionados(selecionados.map((x, j) => (j === i ? { ...x, quantidade: Number(e.target.value) || 1 } : x)))} />
                    </td>
                    <td><button className="btn-link perigo" type="button" onClick={() => setSelecionados(selecionados.filter((_, j) => j !== i))}>Remover</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="cabecalho">
          <h3>Próximos passos</h3>
          <button className="btn btn-peq" type="button"
            onClick={() => setAcoes([...acoes, { descricao: "", status: "nao_iniciado", prazo: "", data_entrega: "", observacoes: "" }])}>
            Adicionar Ação Necessária
          </button>
        </div>
        {acoes.length > 0 && (
          <div className="tabela-wrap">
            <table className="tabela tabela-form">
              <thead><tr><th>Ação *</th><th>Status</th><th>Prazo limite</th><th>Data de entrega</th><th>Observações</th><th></th></tr></thead>
              <tbody>
                {acoes.map((a, i) => (
                  <tr key={i}>
                    <td><input required minLength={2} value={a.descricao} aria-label="Ação" onChange={(e) => mudarAcao(i, { descricao: e.target.value })} /></td>
                    <td>
                      <select value={a.status} aria-label="Status da ação" onChange={(e) => mudarAcao(i, { status: e.target.value as Status })}>
                        {STATUS_OPORTUNIDADE.map((s) => <option key={s} value={s}>{ROTULO_STATUS_OPORTUNIDADE[s]}</option>)}
                      </select>
                    </td>
                    <td><input type="date" value={a.prazo} aria-label="Prazo limite" onChange={(e) => mudarAcao(i, { prazo: e.target.value })} /></td>
                    <td><input type="date" value={a.data_entrega} aria-label="Data de entrega" onChange={(e) => mudarAcao(i, { data_entrega: e.target.value })} /></td>
                    <td><input value={a.observacoes} aria-label="Observações" onChange={(e) => mudarAcao(i, { observacoes: e.target.value })} /></td>
                    <td><button className="btn-link perigo" type="button" onClick={() => setAcoes(acoes.filter((_, j) => j !== i))}>Remover</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {erro && <p className="aviso aviso-erro">{erro}</p>}
        <div className="acoes-linha">
          <button className="btn" type="submit" disabled={enviando || !repId}>{enviando ? "Salvando…" : "Salvar oportunidade"}</button>
          <button className="btn-link" type="button" onClick={onFechar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
