"use client";

import { useState } from "react";
import { Icone } from "@/components/icones";
import { formatarMoeda, formatarPercentual } from "@/lib/formato";
import { subtotalItem } from "@/lib/validacao";

export type LinhaEdicao = {
  produto_id: string;
  sku: string;
  nome: string;
  inativo: boolean;
  quantidade: number;
  preco: number;
  desconto: number;
  desconto_max: number;
  /** quantidade máxima permitida (ex.: devolução vinculada a um pedido: vendida − já devolvida) */
  max?: number;
};

type Valores = Record<string, { quantidade: string; preco: string; desconto: string }>;
const num = (v: string) => Number(v.replace(",", ".")) || 0;
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Tabela de itens (pedido em edição ou devolução): quantidade, preço unitário e desconto (%) por produto.
 * Quantidade 0 = item fora do documento. Subtotais e total recalculam na hora (mesma regra do banco).
 * Busca por SKU ou nome filtra as linhas (os itens já incluídos continuam visíveis).
 */
export function ItensEditaveis({ linhas, documento = "pedido" }: { linhas: LinhaEdicao[]; documento?: string }) {
  const [valores, setValores] = useState<Valores>(() =>
    Object.fromEntries(linhas.map((l) => [l.produto_id, { quantidade: String(l.quantidade), preco: String(l.preco), desconto: String(l.desconto) }])),
  );
  const [busca, setBusca] = useState("");
  const mudar = (id: string, campo: keyof Valores[string], v: string) => setValores((x) => ({ ...x, [id]: { ...x[id]!, [campo]: v } }));

  const total = linhas.reduce((t, l) => {
    const v = valores[l.produto_id]!;
    return t + (num(v.quantidade) > 0 ? subtotalItem(num(v.quantidade), num(v.preco), num(v.desconto)) : 0);
  }, 0);
  const incluidos = linhas.filter((l) => num(valores[l.produto_id]!.quantidade) > 0).length;
  const termo = normalizar(busca.trim());
  const visivel = (l: LinhaEdicao) => !termo || num(valores[l.produto_id]!.quantidade) > 0 || normalizar(`${l.sku} ${l.nome}`).includes(termo);
  const comLimite = linhas.some((l) => l.max != null);

  return (
    <>
      {linhas.length > 8 && (
        <label className="campo campo-busca-itens">
          <span>Buscar produto</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="SKU ou nome" />
        </label>
      )}
      <div className="tabela-wrap">
        <table className="tabela tabela-form">
          <thead>
            <tr>
              <th>SKU</th><th>Produto</th><th className="num">Qtd.</th><th className="num">Preço un. (R$)</th>
              <th className="num">Desconto (%)</th><th className="num">Desc. máx.</th><th className="num">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const v = valores[l.produto_id]!;
              const ativo = num(v.quantidade) > 0;
              const acima = ativo && num(v.desconto) > l.desconto_max;
              const excede = l.max != null && num(v.quantidade) > l.max;
              return (
                <tr key={l.produto_id} className={ativo ? "alterada" : undefined} hidden={!visivel(l)}>
                  <td><code>{l.sku}</code></td>
                  <td>{l.nome}{l.inativo && <span className="dica"> (inativo)</span>}</td>
                  <td className="num">
                    <input className="input-num" name={`qtd_${l.produto_id}`} type="number" min="0" max={l.max} step="any" value={v.quantidade}
                      aria-label={`Quantidade de ${l.nome}`} aria-invalid={excede || undefined} onChange={(e) => mudar(l.produto_id, "quantidade", e.target.value)} />
                    {l.max != null && <div className={excede ? "dica texto-perigo" : "dica"}>máx. {l.max.toLocaleString("pt-BR")}</div>}
                  </td>
                  <td className="num">
                    <input className="input-num" name={`preco_${l.produto_id}`} type="number" min="0" step="0.01" value={v.preco}
                      aria-label={`Preço unitário de ${l.nome}`} onChange={(e) => mudar(l.produto_id, "preco", e.target.value)} />
                  </td>
                  <td className="num">
                    <input className="input-num" name={`desc_${l.produto_id}`} type="number" min="0" max="100" step="0.01" value={v.desconto}
                      aria-label={`Desconto em % de ${l.nome}`} onChange={(e) => mudar(l.produto_id, "desconto", e.target.value)} />
                    {acima && (
                      <span className="txt-alerta com-dica" data-dica="Desconto Acima do Máximo Permitido" role="img" aria-label="Desconto Acima do Máximo Permitido">
                        {" "}<Icone nome="alerta" tamanho={14} />
                      </span>
                    )}
                  </td>
                  <td className="num">{formatarPercentual(l.desconto_max)}</td>
                  <td className="num">{ativo ? formatarMoeda(subtotalItem(num(v.quantidade), num(v.preco), num(v.desconto))) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={6}>Total · {incluidos} {incluidos === 1 ? "item" : "itens"}</th>
              <th className="num">{formatarMoeda(Math.round(total * 100) / 100)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="dica">
        Quantidade 0 retira o produto {documento === "pedido" ? "do pedido" : `da ${documento}`}. Subtotal = qtd × preço × (1 − desconto%).
        {comLimite && " A quantidade não pode passar da vendida no pedido de origem (descontado o que já foi devolvido)."}
      </p>
    </>
  );
}
