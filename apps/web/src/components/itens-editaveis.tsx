"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { atualizarPrecoCatalogoAction, propagarComissaoAction } from "@/app/app/pedidos/alertas-actions";
import { Icone } from "@/components/icones";
import { avisosDoItem, comissaoItem, DICA_COMISSAO, resolverComissao, type AvisoItem } from "@/lib/comissao";
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
  /** % acima do preço de tabela (só pedidos) */
  acrescimo?: number;
  desconto_max: number;
  /** quantidade máxima permitida (ex.: devolução vinculada a um pedido: vendida − já devolvida) */
  max?: number;
  /** Fase 19 (avisos): preço de referência do catálogo (tabela do cliente > padrão) */
  preco_catalogo?: number | null;
  /** Fase 19 (avisos): comissão do produto no catálogo (nulo = vazia) */
  comissao_catalogo?: number | null;
  /** Fase 19 (avisos): % já gravado no item (edição) */
  comissao_item?: number | null;
  /** Fase 20: valor informado na planilha (importação) e o subtotal em que valia — mantido enquanto o subtotal não mudar */
  comissao_planilha?: { valor: number; subtotal: number } | null;
  /** dica abaixo do preço (ex.: "preço do cliente") */
  dica_preco?: string;
};

/** Fase 19: avisos durante o preenchimento (estado do formulário; nada é gravado sem clique). */
export type ConfigAvisos = {
  /** false = pedido importado por Excel: sem avisos de desconto, preço e propagação (G) */
  manual: boolean;
  representadaId: string;
  comissaoRepresentada: number | null;
  /** produtos da representada sem comissão no catálogo (confirmação da propagação) */
  produtosSemComissao: number;
};

type Valores = Record<string, { quantidade: string; preco: string; desconto: string; acrescimo: string }>;
const num = (v: string) => Number(v.replace(",", ".")) || 0;
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const DEBOUNCE_MS = 300;

/**
 * Tabela de itens (pedido novo/em edição ou devolução): quantidade, preço unitário e desconto (%) por produto.
 * Quantidade 0 = item fora do documento. Subtotais e total recalculam na hora (mesma regra do banco).
 * Busca por SKU ou nome filtra as linhas (os itens já incluídos continuam visíveis).
 * Com `avisos` (pedido): desconto acima do limite, preço divergente do catálogo e comissão (Fase 19), avaliados em
 * memória com debounce de 300 ms; nunca bloqueiam o envio. `precoFixo` (pedido novo): o preço vem da tabela.
 */
export function ItensEditaveis({ linhas, documento = "pedido", comAcrescimo = false, avisos, precoFixo = false }: {
  linhas: LinhaEdicao[]; documento?: string; comAcrescimo?: boolean; avisos?: ConfigAvisos; precoFixo?: boolean;
}) {
  const [valores, setValores] = useState<Valores>(() =>
    Object.fromEntries(linhas.map((l) => [l.produto_id, {
      quantidade: String(l.quantidade), preco: String(l.preco), desconto: String(l.desconto), acrescimo: String(l.acrescimo ?? 0),
    }])),
  );
  // valores avaliados pelos avisos: atualizados 300 ms depois da última mudança (sem chamada ao servidor por tecla)
  const [avaliados, setAvaliados] = useState(valores);
  useEffect(() => {
    const t = setTimeout(() => setAvaliados(valores), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [valores]);
  // ajustes locais após um clique explícito (alterar preço no catálogo / aplicar comissão a todos)
  const [catalogo, setCatalogo] = useState<Record<string, { preco?: number; comissao?: number }>>({});
  const [mantidos, setMantidos] = useState<Set<string>>(new Set());
  const [mensagem, setMensagem] = useState<{ ok?: string; erro?: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const sub = (v: Valores[string]) => subtotalItem(num(v.quantidade), num(v.preco), num(v.desconto), comAcrescimo ? num(v.acrescimo) : 0);
  const [busca, setBusca] = useState("");
  const mudar = (id: string, campo: keyof Valores[string], v: string) => setValores((x) => ({ ...x, [id]: { ...x[id]!, [campo]: v } }));

  const total = linhas.reduce((t, l) => {
    const v = valores[l.produto_id]!;
    return t + (num(v.quantidade) > 0 ? sub(v) : 0);
  }, 0);
  const incluidos = linhas.filter((l) => num(valores[l.produto_id]!.quantidade) > 0).length;
  const termo = normalizar(busca.trim());
  const visivel = (l: LinhaEdicao) => !termo || num(valores[l.produto_id]!.quantidade) > 0 || normalizar(`${l.sku} ${l.nome}`).includes(termo);
  const comLimite = linhas.some((l) => l.max != null);
  const colunas = 7 + (comAcrescimo ? 1 : 0) + (avisos ? 1 : 0);
  const rotuloComissao = (
    <span className="com-dica dica-longa" data-dica={DICA_COMISSAO} tabIndex={0} aria-label={`Comissão (R$). ${DICA_COMISSAO}`}>
      Comissão (R$) <Icone nome="info" tamanho={14} />
    </span>
  );

  const precoCat = (l: LinhaEdicao) => catalogo[l.produto_id]?.preco ?? l.preco_catalogo ?? null;
  const comissaoCat = (l: LinhaEdicao) => catalogo[l.produto_id]?.comissao ?? l.comissao_catalogo ?? null;

  function avisosDe(l: LinhaEdicao): AvisoItem[] {
    if (!avisos) return [];
    const v = avaliados[l.produto_id] ?? valores[l.produto_id]!;
    return avisosDoItem({
      manual: avisos.manual, quantidade: num(v.quantidade), preco: num(v.preco), desconto: num(v.desconto),
      precoCatalogo: precoCat(l), descontoMax: l.desconto_max, comissaoCatalogo: comissaoCat(l), temProduto: true,
      comissaoRepresentada: avisos.comissaoRepresentada, comissaoItem: l.comissao_item,
    }).filter((a) => !(a.tipo === "preco_divergente" && mantidos.has(`${l.produto_id}:${num(v.preco)}`)));
  }

  /** E.6 — "Alterar no catálogo": confirmação → atualiza o preço do produto → reavalia os avisos. Não muda o item. */
  async function alterarNoCatalogo(l: LinhaEdicao, preco: number, atual: number) {
    if (!window.confirm(`Alterar o preço de ${l.nome} no catálogo de ${formatarMoeda(atual)} para ${formatarMoeda(preco)}?\nOs preços já gravados em pedidos não mudam.`)) return;
    setOcupado(true);
    const r = await atualizarPrecoCatalogoAction(l.produto_id, preco);
    setOcupado(false);
    setMensagem(r);
    if (r.ok) setCatalogo((c) => ({ ...c, [l.produto_id]: { ...c[l.produto_id], preco } }));
  }

  /** E.5 / J.3 — "Aplicar a todos os produtos desta representada": SÓ por clique, com confirmação da quantidade. */
  async function aplicarATodos(percentual: number) {
    if (!avisos) return;
    const n = avisos.produtosSemComissao;
    if (!window.confirm(`Aplicar a comissão de ${formatarPercentual(percentual)} a ${n} produto(s) desta representada sem comissão no Catálogo?\nProdutos que já têm comissão são preservados.`)) return;
    setOcupado(true);
    const r = await propagarComissaoAction(avisos.representadaId);
    setOcupado(false);
    setMensagem(r);
    if (r.ok) {
      setCatalogo((c) => {
        const novo = { ...c };
        for (const l of linhas) if (!(Number(comissaoCat(l) ?? 0) > 0)) novo[l.produto_id] = { ...novo[l.produto_id], comissao: percentual };
        return novo;
      });
    }
  }

  function Aviso({ a, l }: { a: AvisoItem; l: LinhaEdicao }) {
    const v = valores[l.produto_id]!;
    return (
      <div className={`aviso-item aviso-${a.nivel}`} role="status">
        <p>{a.mensagem}</p>
        {a.tipo === "preco_divergente" && (
          <span className="acoes-aviso">
            <span>Deseja alterar o preço do produto no catálogo?</span>
            <button type="button" className="btn-link" disabled={ocupado} onClick={() => alterarNoCatalogo(l, num(v.preco), a.precoCatalogo)}>Alterar no catálogo</button>
            <button type="button" className="btn-link" onClick={() => setMantidos((m) => new Set(m).add(`${l.produto_id}:${num(v.preco)}`))}>Manter o preço do pedido</button>
          </span>
        )}
        {a.tipo === "comissao_nao_definida" && avisos && (
          <span className="acoes-aviso">
            <Link href={`/app/representadas/${avisos.representadaId}/editar`} target="_blank">Representadas</Link>
            <Link href={`/app/representadas/${avisos.representadaId}/catalogo`} target="_blank">Catálogo</Link>
          </span>
        )}
        {a.tipo === "comissao_catalogo_sem_representada" && avisos && (
          <span className="acoes-aviso"><Link href={`/app/representadas/${avisos.representadaId}/editar`} target="_blank">Representadas</Link></span>
        )}
        {a.tipo === "propagacao" && (
          <span className="acoes-aviso">
            <button type="button" className="btn-secundario btn-peq" disabled={ocupado} onClick={() => aplicarATodos(a.percentual)}>Aplicar a todos os produtos desta representada</button>
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      {linhas.length > 8 && (
        <label className="campo campo-busca-itens">
          <span>Buscar produto</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="SKU ou nome" />
        </label>
      )}
      {mensagem && <p className={`aviso ${mensagem.erro ? "aviso-erro" : "aviso-ok"}`} role="status">{mensagem.erro ?? mensagem.ok}</p>}
      <div className="tabela-wrap">
        <table className="tabela tabela-form">
          <thead>
            <tr>
              <th>SKU</th><th>Produto</th><th className="num">Qtd.</th><th className="num">Preço un. (R$)</th>
              <th className="num">Desconto (%)</th>{comAcrescimo && <th className="num">Acréscimo (%)</th>}
              {avisos && <th className="num">{rotuloComissao}</th>}<th className="num">Desc. máx.</th><th className="num">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const v = valores[l.produto_id]!;
              const ativo = num(v.quantidade) > 0;
              const acima = ativo && num(v.desconto) > l.desconto_max;
              const excede = l.max != null && num(v.quantidade) > l.max;
              const lista = ativo ? avisosDe(l) : [];
              const pct = avisos ? (l.comissao_item ?? resolverComissao({ comissao: comissaoCat(l) }, { comissao_percentual: avisos.comissaoRepresentada })?.percentual ?? 0) : 0;
              // valor avaliado com debounce de 300 ms (sem chamada ao servidor por tecla)
              const va = avaliados[l.produto_id] ?? v;
              const subAvaliado = num(va.quantidade) > 0 ? sub(va) : 0;
              const valorComissao = l.comissao_planilha && Math.abs(l.comissao_planilha.subtotal - subAvaliado) < 0.005
                ? l.comissao_planilha.valor
                : comissaoItem(subAvaliado, Number(pct));
              return [
                <tr key={l.produto_id} id={`item-${l.produto_id}`} className={ativo ? "alterada" : undefined} hidden={!visivel(l)}>
                  <td><code>{l.sku}</code></td>
                  <td>{l.nome}{l.inativo && <span className="dica"> (inativo)</span>}</td>
                  <td className="num">
                    <input className="input-num" name={`qtd_${l.produto_id}`} type="number" min="0" max={l.max} step="any" value={v.quantidade}
                      aria-label={`Quantidade de ${l.nome}`} aria-invalid={excede || undefined} onChange={(e) => mudar(l.produto_id, "quantidade", e.target.value)} />
                    {l.max != null && <div className={excede ? "dica texto-perigo" : "dica"}>máx. {l.max.toLocaleString("pt-BR")}</div>}
                  </td>
                  <td className="num">
                    {precoFixo ? formatarMoeda(num(v.preco)) : (
                      <input className="input-num" name={`preco_${l.produto_id}`} type="number" min="0" step="0.01" value={v.preco}
                        aria-label={`Preço unitário de ${l.nome}`} onChange={(e) => mudar(l.produto_id, "preco", e.target.value)} />
                    )}
                    {l.dica_preco && <div className="dica">{l.dica_preco}</div>}
                  </td>
                  <td className="num">
                    <input className="input-num" name={`desc_${l.produto_id}`} type="number" min="0" max="100" step="0.01" value={v.desconto}
                      aria-label={`Desconto em % de ${l.nome}`} onChange={(e) => mudar(l.produto_id, "desconto", e.target.value)} />
                    {acima && !avisos && (
                      <span className="txt-alerta com-dica" data-dica="Desconto Acima do Máximo Permitido" role="img" aria-label="Desconto Acima do Máximo Permitido">
                        {" "}<Icone nome="alerta" tamanho={14} />
                      </span>
                    )}
                  </td>
                  {comAcrescimo && (
                    <td className="num">
                      <input className="input-num" name={`acr_${l.produto_id}`} type="number" min="0" max="100" step="0.01" value={v.acrescimo}
                        aria-label={`Acréscimo em % de ${l.nome}`} onChange={(e) => mudar(l.produto_id, "acrescimo", e.target.value)} />
                    </td>
                  )}
                  {avisos && (
                    <td className="num campo-calculado" aria-label={`Comissão de ${l.nome}`}>
                      {ativo ? formatarMoeda(valorComissao) : "—"}
                      {ativo && <div className="dica">{formatarPercentual(Number(pct))}</div>}
                    </td>
                  )}
                  <td className="num">{formatarPercentual(l.desconto_max)}</td>
                  <td className="num">{ativo ? formatarMoeda(sub(v)) : "—"}</td>
                </tr>,
                lista.length > 0 && (
                  <tr key={`${l.produto_id}-avisos`} className="linha-avisos" hidden={!visivel(l)}>
                    <td colSpan={colunas}><div className="avisos-item">{lista.map((a) => <Aviso key={a.tipo} a={a} l={l} />)}</div></td>
                  </tr>
                ),
              ];
            })}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={colunas - 1}>Total · {incluidos} {incluidos === 1 ? "item" : "itens"}</th>
              <th className="num">{formatarMoeda(Math.round(total * 100) / 100)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="dica">
        Quantidade 0 retira o produto {documento === "pedido" ? "do pedido" : `da ${documento}`}. Subtotal = qtd × preço × {comAcrescimo && "(1 + acréscimo%) × "}(1 − desconto%).
        {comLimite && " A quantidade não pode passar da vendida no pedido de origem (descontado o que já foi devolvido)."}
        {avisos && " Comissão (R$) = subtotal × percentual (calculada; não entra no total do pedido). Os avisos não impedem salvar: o pedido é emitido e as divergências vão para o quadro da página Pedidos."}
      </p>
    </>
  );
}
