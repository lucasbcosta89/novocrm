"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icone } from "@/components/icones";
import { AGRUPAMENTOS, ATALHOS, ROTULO_AGRUPAMENTO, ROTULO_ATALHO, type DespesaLinha } from "@/lib/custos";
import { Modal } from "../oportunidades/comum";
import { salvarDespesaAction } from "./actions";

type Opcao = { id: string; nome: string };

/** Lista de caixas de seleção dentro de um menu expansível (multi-select acessível, sem dependência). */
function MultiSelect({ nome, rotulo, opcoes, selecionados, onChange }: {
  nome: string; rotulo: string; opcoes: Opcao[]; selecionados: string[]; onChange?: () => void;
}) {
  const marcados = opcoes.filter((o) => selecionados.includes(o.id));
  return (
    <div className="campo">
      <span>{rotulo}</span>
      <details className="multi">
        <summary>{marcados.length === 0 ? "Todas" : marcados.length === 1 ? marcados[0]!.nome : `${marcados.length} selecionadas`}</summary>
        <div className="multi-opcoes" role="group" aria-label={rotulo}>
          {opcoes.length === 0 && <span className="dica">Nenhuma cadastrada.</span>}
          {opcoes.map((o) => (
            <label key={o.id} className="check">
              <input type="checkbox" name={nome} value={o.id} defaultChecked={selecionados.includes(o.id)} onChange={onChange} /> {o.nome}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

/** Filtros na query string (form GET): período, representadas, clientes e agrupamento. */
export function FiltrosCustos({ atalho, de, ate, reps, clis, agrupar, representadas, clientes }: {
  atalho: string; de: string; ate: string; reps: string[]; clis: string[]; agrupar: string; representadas: Opcao[]; clientes: Opcao[];
}) {
  const [periodo, setPeriodo] = useState(atalho);
  const form = useRef<HTMLFormElement>(null);
  const enviar = () => form.current?.requestSubmit();
  return (
    <form ref={form} method="get" className="card filtros-custos">
      <label className="campo">
        <span>Período</span>
        <select name="p" value={periodo} onChange={(e) => { setPeriodo(e.target.value); if (e.target.value !== "personalizado") setTimeout(enviar); }}>
          {ATALHOS.map((a) => <option key={a} value={a}>{ROTULO_ATALHO[a]}</option>)}
        </select>
      </label>
      {periodo === "personalizado" && (
        <>
          <label className="campo"><span>De</span><input type="date" name="de" defaultValue={de} required /></label>
          <label className="campo"><span>Até</span><input type="date" name="ate" defaultValue={ate} required /></label>
        </>
      )}
      <MultiSelect nome="rep" rotulo="Representada" opcoes={representadas} selecionados={reps} />
      <MultiSelect nome="cli" rotulo="Cliente" opcoes={clientes} selecionados={clis} />
      <label className="campo">
        <span>Agrupar por</span>
        <select name="agrupar" defaultValue={agrupar} onChange={enviar}>
          {AGRUPAMENTOS.map((a) => <option key={a} value={a}>{ROTULO_AGRUPAMENTO[a]}</option>)}
        </select>
      </label>
      <div className="acoes-linha">
        <button className="btn-secundario btn-peq" type="submit"><Icone nome="filtro" tamanho={16} /> Aplicar</button>
        <Link className="btn-link" href="/app/custos">Limpar</Link>
      </div>
    </form>
  );
}

const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** "+ Adicionar Despesa" ou "Editar" (com a despesa): popup com o formulário completo. */
export function BotaoDespesa({ despesa, representadas, clientes }: { despesa?: DespesaLinha; representadas: Opcao[]; clientes: Opcao[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    const r = await salvarDespesaAction(despesa?.id ?? null, new FormData(e.currentTarget));
    setSalvando(false);
    if (r.erro) return setErro(r.erro);
    setAberto(false);
    router.refresh();
  }

  return (
    <>
      {despesa ? (
        <button type="button" className="btn-link" onClick={() => setAberto(true)}><Icone nome="lapis" tamanho={16} /> Editar</button>
      ) : (
        <button type="button" className="btn" onClick={() => setAberto(true)}><Icone nome="mais" tamanho={16} /> Adicionar Despesa</button>
      )}
      {aberto && (
        <Modal titulo={despesa ? "Editar despesa" : "Adicionar despesa"} onFechar={() => setAberto(false)} largo={false}>
          <form onSubmit={salvar} className="grade-1">
            <label className="campo"><span>Descrição *</span><input name="descricao" required maxLength={200} defaultValue={despesa?.descricao} placeholder="Ex.: Combustível — rota Anápolis" /></label>
            <div className="grade">
              <label className="campo"><span>Data *</span><input name="data" type="date" required defaultValue={despesa?.data ?? hoje()} /></label>
              <label className="campo">
                <span>Valor (R$) *</span>
                <input name="valor" required inputMode="decimal" pattern="[0-9.,\s]+" placeholder="0,00"
                  defaultValue={despesa ? despesa.valor.toFixed(2).replace(".", ",") : ""} />
              </label>
            </div>
            <fieldset className="secao-form">
              <legend>Representada(s)</legend>
              <div className="multi-opcoes">
                {representadas.length === 0 && <span className="dica">Nenhuma representada cadastrada.</span>}
                {representadas.map((r) => (
                  <label key={r.id} className="check">
                    <input type="checkbox" name="representadas" value={r.id} defaultChecked={despesa?.representadas.some((x) => x.id === r.id)} /> {r.nome}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="secao-form">
              <legend>Cliente(s)</legend>
              <div className="multi-opcoes">
                {clientes.length === 0 && <span className="dica">Nenhum cliente cadastrado.</span>}
                {clientes.map((c) => (
                  <label key={c.id} className="check">
                    <input type="checkbox" name="clientes" value={c.id} defaultChecked={despesa?.clientes.some((x) => x.id === c.id)} /> {c.nome}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="campo"><span>Observações</span><textarea name="observacoes" rows={3} maxLength={2000} defaultValue={despesa?.observacoes ?? ""} /></label>
            {erro && <p className="aviso aviso-erro" role="alert">{erro}</p>}
            <div className="acoes-linha">
              <button className="btn" type="submit" disabled={salvando}><Icone nome="check" tamanho={16} /> {salvando ? "Salvando…" : "Salvar"}</button>
              <button className="btn-link" type="button" onClick={() => setAberto(false)}>Cancelar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
