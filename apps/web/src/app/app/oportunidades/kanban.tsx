"use client";

import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Icone } from "@/components/icones";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { formatarMoeda } from "@/lib/formato";
import { alertaTarefas } from "@/lib/oportunidades";
import { ROTULO_PRIORIDADE, ROTULO_RESULTADO, ROTULO_STATUS_OPORTUNIDADE, ROTULO_TIPO_OPORTUNIDADE } from "@/lib/rotulos";
import { PRIORIDADES, STATUS_OPORTUNIDADE } from "@/lib/validacao";
import type { CartaoKanban } from "@/server/oportunidades";
import type { Produto } from "@/server/produtos";
import { api, BuscaProdutos, Modal, ResultadoModal, SelectEstado } from "./comum";
import { DetalheOportunidade } from "./detalhe";
import { PersonalizarFunil } from "./personalizar-funil";

type Rep = { id: string; nome: string };
type Status = (typeof STATUS_OPORTUNIDADE)[number];
type Agrupar = "nenhum" | "representada" | "cidade" | "estado" | "prioridade";
type Filtros = { representada: string; cidade: string; estado: string; prioridade: string; status: string };
export type EtapaKanban = { id: string; nome: string; ordem: number; e_fechamento: boolean };
export type FunilKanban = { id: string; nome: string; etapas: EtapaKanban[] };

const FILTROS_VAZIOS: Filtros = { representada: "", cidade: "", estado: "", prioridade: "", status: "" };

const valorGrupo = (o: CartaoKanban, g: Agrupar) =>
  g === "representada" ? (o.representada?.nome ?? "Sem representada")
  : g === "cidade" ? (o.cidade ?? "Sem cidade")
  : g === "estado" ? (o.estado ?? "Sem estado")
  : g === "prioridade" ? (ROTULO_PRIORIDADE[o.prioridade] ?? o.prioridade)
  : "";

/**
 * Kanban de um funil: colunas = etapas (ordem). Arrastar (ou o seletor do card) grava etapa_id;
 * cair na etapa de fechamento abre o popup Ganhou/Perdeu. Clique simples abre o detalhe (Fase 4c).
 */
export function Kanban({ funil, funis, inicial, representadas, hoje }: {
  funil: FunilKanban; funis: { id: string; nome: string }[]; inicial: CartaoKanban[]; representadas: Rep[];
  /** data de hoje (AAAA-MM-DD, Brasília) para os alertas de tarefas */
  hoje: string;
}) {
  const router = useRouter();
  const [itens, setItens] = useState(inicial);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [agrupar, setAgrupar] = useState<Agrupar>("nenhum");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [concluir, setConcluir] = useState<{ id: string; etapaId: string } | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [personalizar, setPersonalizar] = useState(false);
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

  const atualizarLocal = (id: string, campos: Partial<CartaoKanban>) => setItens((xs) => xs.map((o) => (o.id === id ? { ...o, ...campos } : o)));

  /** Mover para outra etapa: fechamento pede o resultado antes de gravar; as demais salvam na hora (otimista). */
  async function mover(id: string, etapaId: string) {
    const atual = itens.find((o) => o.id === id);
    const etapa = funil.etapas.find((e) => e.id === etapaId);
    if (!atual || !etapa || atual.etapa_id === etapaId) return;
    if (etapa.e_fechamento) {
      setConcluir({ id, etapaId });
      return;
    }
    // saiu do fechamento: volta a "em progresso" e o resultado anterior é limpo
    const reabrir = atual.status === "concluido";
    setErro(null);
    atualizarLocal(id, { etapa_id: etapaId, ...(reabrir ? { status: "em_progresso", resultado: null, observacoes_resultado: null, data_conclusao: null } : {}) });
    try {
      await api(`/api/oportunidades/${id}`, { method: "PATCH", body: JSON.stringify({ etapa_id: etapaId, ...(reabrir ? { status: "em_progresso" } : {}) }) });
    } catch (e) {
      atualizarLocal(id, { etapa_id: atual.etapa_id, status: atual.status, resultado: atual.resultado, observacoes_resultado: atual.observacoes_resultado, data_conclusao: atual.data_conclusao });
      setErro(e instanceof Error ? e.message : "Falha ao salvar");
    }
  }

  /** Arquivar (só concluídas): sai do kanban e vai para a página Arquivo. */
  async function arquivar(id: string) {
    const atual = itens.find((o) => o.id === id);
    if (!atual) return;
    setErro(null);
    setItens((xs) => xs.filter((o) => o.id !== id));
    try {
      await api(`/api/oportunidades/${id}`, { method: "PATCH", body: JSON.stringify({ arquivada: true }) });
    } catch (e) {
      setItens((xs) => [atual, ...xs]);
      setErro(e instanceof Error ? e.message : "Falha ao arquivar");
    }
  }

  /** Etapa excluída no "Personalizar": os cards dela vão para a primeira etapa restante (mesma regra do servidor). */
  function etapaExcluida(etapaId: string) {
    const destino = funil.etapas.find((e) => e.id !== etapaId && !e.e_fechamento);
    if (destino) setItens((xs) => xs.map((o) => (o.etapa_id === etapaId ? { ...o, etapa_id: destino.id } : o)));
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
      <div className="card funil-topo">
        <label className="campo campo-filtro">
          <span>Funil</span>
          <select value={funil.id} onChange={(e) => router.push(`/app/oportunidades/funis/${e.target.value}`)}>
            {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </label>
        <div className="kanban-acoes">
          <button className="btn-suave" type="button" onClick={() => setPersonalizar(true)}>
            <Icone nome="engrenagem" tamanho={16} /> Personalizar Funil
          </button>
          <button className="btn" type="button" onClick={() => setNovo(true)} disabled={representadas.length === 0}
            title={representadas.length === 0 ? "Cadastre uma representada primeiro" : undefined}>
            <Icone nome="mais" tamanho={16} /> Nova Oportunidade
          </button>
        </div>
      </div>

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
        {Object.values(filtros).some(Boolean) && (
          <div className="kanban-acoes">
            <button className="btn-link" type="button" onClick={() => setFiltros(FILTROS_VAZIOS)}>Limpar filtros</button>
          </div>
        )}
      </div>
      {erro && <p className="aviso aviso-erro">{erro}</p>}

      {grupos.map((g) => (
        <section key={g.nome || "todos"} className="kanban-grupo">
          {g.nome && <h2 className="kanban-grupo-titulo">{g.nome} <span className="dica">({g.itens.length})</span></h2>}
          <div className="kanban" style={{ gridTemplateColumns: `repeat(${funil.etapas.length}, minmax(220px, 1fr))` }}>
            {funil.etapas.map((etapa, i) => {
              const coluna = g.itens.filter((o) => o.etapa_id === etapa.id);
              const alvo = `${g.nome}|${etapa.id}`;
              return (
                <div
                  key={etapa.id}
                  className={`kanban-coluna ${etapa.e_fechamento ? "coluna-fechamento" : ""} ${sobre === alvo ? "sobre" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setSobre(alvo);
                  }}
                  onDragLeave={() => setSobre((s) => (s === alvo ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setSobre(null);
                    const id = e.dataTransfer.getData("text/plain") || arrastando;
                    if (id) void mover(id, etapa.id);
                  }}
                >
                  <h3>
                    <span className="com-icone">
                      {etapa.e_fechamento ? <Icone nome="alvo" tamanho={16} /> : <span className="numero-etapa">{i + 1}</span>} {etapa.nome}
                    </span>
                    <span className="dica">{coluna.length}</span>
                  </h3>
                  {coluna.map((o) => (
                    <Cartao key={o.id} o={o} etapas={funil.etapas} hoje={hoje} onDrag={setArrastando} onMover={mover} onAbrir={setDetalhe} onArquivar={arquivar} />
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {novo && (
        <NovaOportunidade
          funilId={funil.id}
          representadas={representadas}
          onFechar={() => setNovo(false)}
          onCriada={(o) => {
            setItens((xs) => [o, ...xs]);
            setNovo(false);
            if (o.status === "concluido" && o.etapa_id) setConcluir({ id: o.id, etapaId: o.etapa_id });
          }}
        />
      )}
      {concluir && (
        <ResultadoModal
          oportunidade={itens.find((o) => o.id === concluir.id)!}
          etapaId={concluir.etapaId}
          comNotas
          onFechar={() => setConcluir(null)}
          onConcluida={(campos) => {
            atualizarLocal(concluir.id, { status: "concluido", etapa_id: concluir.etapaId, ...campos });
            setConcluir(null);
          }}
        />
      )}
      {personalizar && (
        <PersonalizarFunil funil={funil} onFechar={() => setPersonalizar(false)} onEtapaExcluida={etapaExcluida} />
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

function Cartao({ o, etapas, hoje, onDrag, onMover, onAbrir, onArquivar }: {
  o: CartaoKanban; etapas: EtapaKanban[]; hoje: string; onDrag: (id: string | null) => void; onMover: (id: string, etapaId: string) => void;
  onAbrir: (id: string) => void; onArquivar: (id: string) => void;
}) {
  const feitas = o.acoes.filter((a) => a.status === "concluido").length;
  const alerta = alertaTarefas(o.acoes, hoje);
  const fimArraste = useRef(0);
  return (
    <article
      className={`kanban-cartao ${o.resultado ? `resultado-${o.resultado}` : ""} ${alerta ? `faixa-${alerta.nivel}` : ""}`}
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
        <span className="cartao-topo-dir">
          <span className="dica">{ROTULO_PRIORIDADE[o.prioridade] ?? o.prioridade}</span>
          {alerta?.nivel === "vermelho" && (
            <span className="alerta-card com-dica dica-alerta" data-dica={alerta.mensagem} role="img" aria-label={alerta.mensagem} tabIndex={0}
              onClick={(e) => e.stopPropagation()}>
              <Icone nome="alerta" tamanho={16} />
            </span>
          )}
        </span>
      </div>
      <strong>{o.titulo}</strong>
      <span className="dica">{o.representada?.nome ?? "Sem representada"}</span>
      {o.cliente && (
        <span className="dica com-avatar">
          <Avatar nome={o.cliente.nome} pequeno /> <Link href={`/app/clientes/${o.cliente.id}`} onClick={(e) => e.stopPropagation()}>{o.cliente.nome}</Link>
        </span>
      )}
      {(o.cidade || o.estado) && <span className="dica">{[o.cidade, o.estado].filter(Boolean).join("/")}</span>}
      {o.valor_estimado != null && <span className="dica">{formatarMoeda(Number(o.valor_estimado))}</span>}
      <span className="dica">{o.produtos.length} produto(s) · ações {feitas}/{o.acoes.length}</span>
      {o.acoes.length > 0 && (
        <span className="progresso" aria-hidden="true"><span style={{ width: `${Math.round((feitas / o.acoes.length) * 100)}%` }} /></span>
      )}
      {o.resultado && (
        <span className={`etiqueta ${o.resultado === "ganhou" ? "etiqueta-recebida" : "etiqueta-atrasada"}`} title={o.observacoes_resultado ?? undefined}>
          {ROTULO_RESULTADO[o.resultado]}
        </span>
      )}
      {/* alternativa ao arrastar (teclado/celular) */}
      <select aria-label={`Mover ${o.titulo} para a etapa`} value={o.etapa_id ?? ""} onClick={(e) => e.stopPropagation()} onChange={(e) => onMover(o.id, e.target.value)}>
        {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
      </select>
      {o.status === "concluido" && (
        <button type="button" className="btn-suave btn-peq" draggable={false}
          onClick={(e) => { e.stopPropagation(); onArquivar(o.id); }}>
          <Icone nome="arquivo" tamanho={16} /> Arquivar
        </button>
      )}
    </article>
  );
}

type AcaoForm = { descricao: string; status: Status; prazo: string; data_entrega: string; observacoes: string };

function NovaOportunidade({ funilId, representadas, onFechar, onCriada }: { funilId: string; representadas: Rep[]; onFechar: () => void; onCriada: (o: CartaoKanban) => void }) {
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
          funil_id: funilId, titulo: fd.get("titulo"), cidade: fd.get("cidade"), estado: fd.get("estado"), representada_id: repId,
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

        <h3 className="titulo-icone"><Icone nome="pacote" tamanho={18} /> Produtos</h3>
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
          <h3 className="titulo-icone"><Icone nome="alvo" tamanho={18} /> Próximos passos</h3>
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
