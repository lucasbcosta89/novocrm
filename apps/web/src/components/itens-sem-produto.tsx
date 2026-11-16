"use client";

import { useState } from "react";
import { Icone } from "@/components/icones";
import { comissaoItem } from "@/lib/comissao";
import { formatarMoeda, formatarPercentual } from "@/lib/formato";
import { subtotalItem } from "@/lib/validacao";

export type ItemSemProduto = {
  /** id do item já gravado (edição) */
  id?: string | null;
  descricao: string;
  sku: string;
  quantidade: number;
  preco: number;
  desconto: number;
  acrescimo: number;
};

type Linha = { chave: string; id: string | null; descricao: string; sku: string; quantidade: string; preco: string; desconto: string; acrescimo: string };
const num = (v: string) => Number(v.replace(",", ".")) || 0;
let seq = 0;
const novaChave = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Fase 17.1 (C.3) — itens SEM produto cadastrado no formulário de pedido. Descrição obrigatória (até 200), SKU
 * opcional; o item é gravado com pendência de vínculo (selo vermelho na listagem, tabela de pendências e alerta do
 * Catálogo) e NÃO bloqueia a emissão. Comissão (somente leitura) pela REPRESENTADA (D); desconto máximo pela
 * cascata sem o nível do produto (F). Campos: sp_<chave>_desc/_sku/_qtd/_preco/_descpct/_acr/_id.
 */
export function ItensSemProduto({ iniciais = [], comissaoRepresentada, descontoMax, comAcrescimo = true, manual = true }: {
  iniciais?: ItemSemProduto[]; comissaoRepresentada: number | null; descontoMax: number; comAcrescimo?: boolean; manual?: boolean;
}) {
  const [linhas, setLinhas] = useState<Linha[]>(() => iniciais.map((i) => ({
    chave: i.id ? i.id.replace(/-/g, "") : novaChave(), id: i.id ?? null, descricao: i.descricao, sku: i.sku,
    quantidade: String(i.quantidade), preco: String(i.preco), desconto: String(i.desconto), acrescimo: String(i.acrescimo),
  })));
  const mudar = (chave: string, campo: keyof Linha, v: string) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: v } : l)));
  const adicionar = () => setLinhas((ls) => [...ls, { chave: novaChave(), id: null, descricao: "", sku: "", quantidade: "1", preco: "", desconto: "0", acrescimo: "0" }]);
  const remover = (chave: string) => setLinhas((ls) => ls.filter((l) => l.chave !== chave));
  const pct = Number(comissaoRepresentada ?? 0) > 0 ? Number(comissaoRepresentada) : 0;
  const sub = (l: Linha) => subtotalItem(num(l.quantidade), num(l.preco), num(l.desconto), comAcrescimo ? num(l.acrescimo) : 0);
  const total = linhas.reduce((t, l) => t + sub(l), 0);

  return (
    <div className="itens-sem-produto">
      <h3 className="titulo-icone"><Icone nome="alerta" tamanho={18} /> Itens sem produto cadastrado</h3>
      <p className="dica">
        Para vender um item que ainda não está no Catálogo. Ele fica como pendência do pedido (em vermelho na listagem) até ser
        vinculado a um produto; a emissão não é bloqueada. Comissão pela representada{pct > 0 ? ` (${formatarPercentual(pct)})` : ": sem comissão definida, o item fica com R$ 0,00 e vai para análise"}.
      </p>
      {linhas.length > 0 && (
        <div className="tabela-wrap">
          <table className="tabela tabela-form">
            <thead>
              <tr>
                <th>Descrição do item *</th><th>SKU</th><th className="num">Qtd.</th><th className="num">Preço un. (R$)</th>
                <th className="num">Desconto (%)</th>{comAcrescimo && <th className="num">Acréscimo (%)</th>}<th className="num">Comissão (R$)</th>
                <th className="num">Subtotal</th><th />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const acima = manual && num(l.desconto) > descontoMax;
                return [
                  <tr key={l.chave} className="alterada">
                    <td>
                      {l.id && <input type="hidden" name={`sp_${l.chave}_id`} value={l.id} />}
                      <input name={`sp_${l.chave}_desc`} value={l.descricao} required maxLength={200} aria-label="Descrição do item"
                        placeholder="Ex.: Caderno 10 matérias" onChange={(e) => mudar(l.chave, "descricao", e.target.value)} />
                    </td>
                    <td><input name={`sp_${l.chave}_sku`} value={l.sku} maxLength={60} aria-label="SKU do item (opcional)" placeholder="Opcional" onChange={(e) => mudar(l.chave, "sku", e.target.value)} /></td>
                    <td className="num"><input className="input-num" name={`sp_${l.chave}_qtd`} type="number" min="0.001" step="any" required value={l.quantidade} aria-label="Quantidade do item" onChange={(e) => mudar(l.chave, "quantidade", e.target.value)} /></td>
                    <td className="num"><input className="input-num" name={`sp_${l.chave}_preco`} type="number" min="0" step="0.01" required value={l.preco} aria-label="Preço unitário do item" onChange={(e) => mudar(l.chave, "preco", e.target.value)} /></td>
                    <td className="num">
                      <input className="input-num" name={`sp_${l.chave}_descpct`} type="number" min="0" max="100" step="0.01" value={l.desconto} aria-label="Desconto em % do item" onChange={(e) => mudar(l.chave, "desconto", e.target.value)} />
                      <div className="dica">máx. {formatarPercentual(descontoMax)}</div>
                    </td>
                    {comAcrescimo && <td className="num"><input className="input-num" name={`sp_${l.chave}_acr`} type="number" min="0" max="100" step="0.01" value={l.acrescimo} aria-label="Acréscimo em % do item" onChange={(e) => mudar(l.chave, "acrescimo", e.target.value)} /></td>}
                    <td className="num campo-calculado">{formatarMoeda(comissaoItem(sub(l), pct))}<div className="dica">{formatarPercentual(pct)}</div></td>
                    <td className="num">{formatarMoeda(sub(l))}</td>
                    <td><button type="button" className="btn-link perigo" onClick={() => remover(l.chave)} aria-label="Remover item"><Icone nome="lixeira" tamanho={16} /></button></td>
                  </tr>,
                  acima && (
                    <tr key={`${l.chave}-aviso`} className="linha-avisos">
                      <td colSpan={comAcrescimo ? 9 : 8}>
                        <div className="aviso-item aviso-amarelo" role="status"><p>Desconto de {formatarPercentual(num(l.desconto))} acima do máximo permitido ({formatarPercentual(descontoMax)}).</p></div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
            <tfoot><tr><th colSpan={comAcrescimo ? 7 : 6}>Total dos itens sem produto</th><th className="num">{formatarMoeda(Math.round(total * 100) / 100)}</th><th /></tr></tfoot>
          </table>
        </div>
      )}
      <button type="button" className="btn-secundario btn-peq" onClick={adicionar}><Icone nome="mais" tamanho={14} /> Adicionar item sem produto</button>
    </div>
  );
}
