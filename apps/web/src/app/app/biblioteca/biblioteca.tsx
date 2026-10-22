"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icone, type NomeIcone } from "@/components/icones";
import { api, Modal } from "../oportunidades/comum";

type Opcao = { id: string; nome: string };
type Relatorio = {
  chave: string;
  secao: "Vendas" | "Comissões" | "KPIs";
  nome: string;
  descricao: string;
  icone: NomeIcone;
  tipo: string;
  /** campo obrigatório do modal, quando houver */
  exige?: "cliente" | "representada";
  /** parâmetros fixos (ex.: comissões gerais = todas as representadas) */
  fixo?: Record<string, string>;
};

const RELATORIOS: Relatorio[] = [
  { chave: "vendas_geral", secao: "Vendas", nome: "Vendas — Geral", descricao: "Total, nº de pedidos e ticket médio, com quebra por mês, por representada e top 10 clientes.", icone: "grafico", tipo: "relatorio_vendas_geral" },
  { chave: "vendas_cliente", secao: "Vendas", nome: "Vendas — Por cliente", descricao: "Pedidos do cliente no período, com itens, totais e ticket médio.", icone: "pessoas", tipo: "relatorio_vendas_cliente", exige: "cliente" },
  { chave: "vendas_representada", secao: "Vendas", nome: "Vendas — Por representada", descricao: "Vendas da representada por cliente e por produto.", icone: "predio", tipo: "relatorio_vendas_representada", exige: "representada" },
  { chave: "comissoes_geral", secao: "Comissões", nome: "Comissões — Geral", descricao: "Total por representada e total geral, com detalhe por produto.", icone: "cifrao", tipo: "relatorio_comissao", fixo: { representada_id: "todas" } },
  { chave: "comissoes_representada", secao: "Comissões", nome: "Comissões — Por representada", descricao: "Comissões dos pedidos do período com detalhe por produto.", icone: "recibo", tipo: "relatorio_comissao", exige: "representada" },
  { chave: "kpis", secao: "KPIs", nome: "KPIs", descricao: "Vendas, ticket médio, % oportunidades convertidas e % clientes convertidos, com variação vs período anterior.", icone: "tendencia", tipo: "relatorio_kpis" },
];

const mesAtual = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
type Aviso = { tipo: "erro" | "ok"; texto: string; link?: string };

/**
 * Biblioteca: cards de relatórios gerais → modal (período + cliente/representada) → POST /api/relatorios
 * (mesmo fluxo da Fase 7: hash_cache, quota pdf_mes, template 7b). O servidor sempre valida a quota.
 */
export function Biblioteca({ clientes, representadas, limiteAtingido }: { clientes: Opcao[]; representadas: Opcao[]; limiteAtingido: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<Relatorio | null>(null);
  const [gerando, setGerando] = useState<Record<string, boolean>>({});
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 7000);
    return () => clearTimeout(t);
  }, [aviso]);

  /** Acompanha o job até ficar pronto (ou falhar) e atualiza contador e lista. */
  async function acompanhar(r: Relatorio, id: string, url: string) {
    for (let i = 0; i < 80; i++) {
      await new Promise((ok) => setTimeout(ok, 1500));
      const s = await fetch(`/api/documentos/${id}/status`).then((x) => x.json()).catch(() => null) as { status?: string; erro?: string } | null;
      if (s?.status === "pronto") {
        setAviso({ tipo: "ok", texto: `${r.nome}: PDF pronto.`, link: url });
        break;
      }
      if (s?.status === "falha") {
        setAviso({ tipo: "erro", texto: `${r.nome}: falha ao gerar o PDF${s.erro ? ` (${s.erro})` : ""}.` });
        break;
      }
    }
    setGerando((g) => ({ ...g, [r.chave]: false }));
    router.refresh();
  }

  async function gerar(r: Relatorio, corpo: Record<string, string>) {
    setAberto(null);
    setGerando((g) => ({ ...g, [r.chave]: true }));
    try {
      const resp = await api<{ documento: { id: string; status: string }; url: string; cache: boolean }>("/api/relatorios", {
        method: "POST",
        body: JSON.stringify({ tipo: r.tipo, ...r.fixo, ...corpo }),
      });
      if (resp.cache && resp.documento.status === "pronto") {
        setAviso({ tipo: "ok", texto: `${r.nome}: os dados não mudaram — usamos o PDF já gerado (sem consumir a quota).`, link: resp.url });
        setGerando((g) => ({ ...g, [r.chave]: false }));
        router.refresh();
        return;
      }
      router.refresh(); // contador e "Gerados recentemente" já mostram o novo documento
      await acompanhar(r, resp.documento.id, resp.url);
    } catch (e) {
      setGerando((g) => ({ ...g, [r.chave]: false }));
      setAviso({ tipo: "erro", texto: e instanceof Error ? e.message : "Falha ao gerar o PDF" });
    }
  }

  return (
    <>
      {(["Vendas", "Comissões", "KPIs"] as const).map((secao) => (
        <section key={secao} className="card">
          <h2 className="titulo-icone">
            <Icone nome={secao === "Vendas" ? "grafico" : secao === "Comissões" ? "cifrao" : "tendencia"} tamanho={20} /> {secao}
          </h2>
          <div className="biblioteca-cards">
            {RELATORIOS.filter((r) => r.secao === secao).map((r) => {
              const semOpcoes = (r.exige === "cliente" && clientes.length === 0) || (r.exige === "representada" && representadas.length === 0);
              return (
                <article key={r.chave} className="biblioteca-card">
                  <span className="kpi-icone tom-azul"><Icone nome={r.icone} tamanho={20} /></span>
                  <div className="biblioteca-texto">
                    <h3>{r.nome}</h3>
                    <p className="dica">{r.descricao}</p>
                  </div>
                  <div className="biblioteca-acao">
                    <button type="button" className="btn btn-peq" disabled={limiteAtingido || gerando[r.chave] || semOpcoes} onClick={() => setAberto(r)}>
                      <Icone nome="documento" tamanho={16} /> {gerando[r.chave] ? "Gerando…" : "Gerar PDF"}
                    </button>
                    {limiteAtingido && <small className="erro-campo">Limite de PDFs do mês atingido</small>}
                    {!limiteAtingido && semOpcoes && <small className="dica">Cadastre {r.exige === "cliente" ? "um cliente" : "uma representada"} primeiro.</small>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {aberto && <ModalRelatorio relatorio={aberto} clientes={clientes} representadas={representadas} onFechar={() => setAberto(null)} onConfirmar={(c) => void gerar(aberto, c)} />}

      {aviso && (
        <div className={`toast toast-${aviso.tipo}`} role={aviso.tipo === "erro" ? "alert" : "status"}>
          <Icone nome={aviso.tipo === "erro" ? "alerta" : "check"} tamanho={16} />
          <span>{aviso.texto}</span>
          {aviso.link && <a href={aviso.link}>Baixar</a>}
          <button type="button" className="btn-link" aria-label="Fechar aviso" onClick={() => setAviso(null)}><Icone nome="fechar" tamanho={14} /></button>
        </div>
      )}
    </>
  );
}

function ModalRelatorio({ relatorio, clientes, representadas, onFechar, onConfirmar }: {
  relatorio: Relatorio; clientes: Opcao[]; representadas: Opcao[]; onFechar: () => void; onConfirmar: (corpo: Record<string, string>) => void;
}) {
  const [modo, setModo] = useState<"mes" | "intervalo">("mes");
  const [erro, setErro] = useState<string | null>(null);

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    let periodo = String(fd.get("mes") ?? "");
    if (modo === "intervalo") {
      const de = String(fd.get("de") ?? "");
      const ate = String(fd.get("ate") ?? "");
      if (!de || !ate || ate < de) return setErro("Informe um intervalo válido (a data final não pode ser antes da inicial).");
      periodo = `${de}_${ate}`;
    }
    const corpo: Record<string, string> = { periodo };
    if (relatorio.exige === "cliente") corpo.cliente_id = String(fd.get("cliente_id") ?? "");
    if (relatorio.exige === "representada") corpo.representada_id = String(fd.get("representada_id") ?? "");
    onConfirmar(corpo);
  }

  return (
    <Modal titulo={relatorio.nome} onFechar={onFechar} largo={false}>
      <form onSubmit={enviar} className="grade-1">
        <div className="filtro-tipos" role="radiogroup" aria-label="Tipo de período">
          <button type="button" role="radio" aria-checked={modo === "mes"} className={`chip-filtro ${modo === "mes" ? "ativo" : ""}`} onClick={() => setModo("mes")}>Mês</button>
          <button type="button" role="radio" aria-checked={modo === "intervalo"} className={`chip-filtro ${modo === "intervalo" ? "ativo" : ""}`} onClick={() => setModo("intervalo")}>Intervalo</button>
        </div>
        {modo === "mes" ? (
          <label className="campo"><span>Mês *</span><input name="mes" type="month" required defaultValue={mesAtual()} /></label>
        ) : (
          <div className="grade">
            <label className="campo"><span>De *</span><input name="de" type="date" required /></label>
            <label className="campo"><span>Até *</span><input name="ate" type="date" required /></label>
          </div>
        )}
        {relatorio.exige === "cliente" && (
          <label className="campo">
            <span>Cliente *</span>
            <select name="cliente_id" required defaultValue="">
              <option value="" disabled>Selecione…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
        )}
        {relatorio.exige === "representada" && (
          <label className="campo">
            <span>Representada *</span>
            <select name="representada_id" required defaultValue="">
              <option value="" disabled>Selecione…</option>
              {representadas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          </label>
        )}
        {erro && <p className="aviso aviso-erro" role="alert">{erro}</p>}
        <p className="dica">Cada PDF novo consome 1 da quota do mês. Se os dados não mudaram, o PDF já gerado é reaproveitado sem consumir.</p>
        <div className="acoes-linha">
          <button className="btn" type="submit"><Icone nome="documento" tamanho={16} /> Gerar PDF</button>
          <button className="btn-link" type="button" onClick={onFechar}>Cancelar</button>
          <Link className="btn-link" href="/app/perfil">Meus dados</Link>
        </div>
      </form>
    </Modal>
  );
}
