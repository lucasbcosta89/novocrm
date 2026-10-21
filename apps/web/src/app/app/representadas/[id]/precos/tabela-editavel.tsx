"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatarMoeda, formatarPercentual } from "@/lib/formato";
import type { PrecoTabela } from "@/server/consultas";
import { salvarPrecosAction } from "../../actions";

type Valores = Record<string, { preco: string; desconto_max: string }>;

const inicial = (precos: PrecoTabela[]): Valores =>
  Object.fromEntries(precos.map((t) => [t.id, { preco: String(t.preco), desconto_max: String(t.desconto_max ?? 0) }]));

/** Tabela de preços estilo planilha: "Editar" libera as células; "Salvar" confirma antes de gravar. */
export function TabelaPrecosEditavel({ representadaId, precos }: { representadaId: string; precos: PrecoTabela[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState<Valores>(() => inicial(precos));
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);

  const alteradas = precos.filter(
    (t) => Number(valores[t.id]?.preco) !== Number(t.preco) || Number(valores[t.id]?.desconto_max) !== Number(t.desconto_max ?? 0),
  );
  const mudar = (id: string, campo: "preco" | "desconto_max", v: string) => setValores((x) => ({ ...x, [id]: { ...x[id]!, [campo]: v } }));

  async function salvar() {
    if (alteradas.length === 0) return setEditando(false);
    if (!window.confirm("As alterações serão permanentes. Deseja salvar?")) return;
    setSalvando(true);
    const r = await salvarPrecosAction(
      representadaId,
      alteradas.map((t) => ({ id: t.id, preco: Number(valores[t.id]!.preco), desconto_max: Number(valores[t.id]!.desconto_max) })),
    );
    setSalvando(false);
    setMsg(r);
    if (r.ok) {
      setEditando(false);
      router.refresh();
    }
  }

  function cancelar() {
    setValores(inicial(precos));
    setEditando(false);
    setMsg(null);
  }

  return (
    <>
      <div className="cabecalho">
        <h2>Tabela de preços</h2>
        <span className="acoes-linha">
          {editando ? (
            <>
              <button type="button" className="btn btn-peq" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : `Salvar${alteradas.length ? ` (${alteradas.length})` : ""}`}</button>
              <button type="button" className="btn-link" onClick={cancelar} disabled={salvando}>Cancelar</button>
            </>
          ) : (
            <button type="button" className="btn btn-peq" onClick={() => { setMsg(null); setEditando(true); }} disabled={precos.length === 0}>Editar</button>
          )}
        </span>
      </div>
      {msg?.ok && <p className="aviso aviso-ok">{msg.ok}</p>}
      {msg?.erro && <p className="aviso aviso-erro">{msg.erro}</p>}
      {precos.length === 0 ? (
        <div className="vazio">Sem preços cadastrados.</div>
      ) : (
        <div className="tabela-wrap">
          <table className={`tabela ${editando ? "tabela-form planilha" : ""}`}>
            <thead>
              <tr><th>Tabela</th><th>SKU</th><th>Produto</th><th>Preço (R$)</th><th>Desc. máx. (%)</th></tr>
            </thead>
            <tbody>
              {precos.map((t) => {
                const v = valores[t.id]!;
                const mudou = alteradas.includes(t);
                return (
                  <tr key={t.id} className={mudou ? "alterada" : undefined}>
                    <td>{t.cliente ? <Link href={`/app/clientes/${t.cliente.id}`}>{t.cliente.nome}</Link> : "Padrão"}</td>
                    <td><code>{t.produto?.sku}</code></td>
                    <td>{t.produto?.nome}</td>
                    <td>
                      {editando ? (
                        <input type="number" min={0} step="0.01" value={v.preco} aria-label={`Preço de ${t.produto?.nome}`} onChange={(e) => mudar(t.id, "preco", e.target.value)} />
                      ) : (
                        formatarMoeda(Number(t.preco))
                      )}
                    </td>
                    <td>
                      {editando ? (
                        <input type="number" min={0} max={100} step="0.01" value={v.desconto_max} aria-label={`Desconto máximo de ${t.produto?.nome}`} onChange={(e) => mudar(t.id, "desconto_max", e.target.value)} />
                      ) : (
                        formatarPercentual(Number(t.desconto_max ?? 0))
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
