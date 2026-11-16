import { z } from "zod";
import { formatarMoeda, formatarPercentual } from "./formato";

/**
 * Fase 19 — precedência de comissão e avisos do item (funções puras, usadas no formulário e espelhadas no banco
 * pela função SQL resolver_comissao_pct / recalcular_alertas_pedido).
 *
 * Precedência, nesta ordem ("definida" = maior que 0; nulo ou 0 = vazia):
 *  D.1 Representada E catálogo definidos → vale SEMPRE a da REPRESENTADA. Sem alerta: a divergência entre os dois é
 *      intencional (fica só sinalizada em `divergencia`, para log).
 *  D.2 Catálogo vazio e representada definida → a da representada; `oferecerPropagacao` habilita a OFERTA visual de
 *      copiar a comissão para o catálogo. NADA é gravado no catálogo automaticamente: só por clique explícito.
 *  D.3 Representada vazia e catálogo definido → a do CATÁLOGO (o item não fica zerado) + alerta
 *      'comissao_catalogo_sem_representada' (Fase 19). Fase 21 (A.2): esse alerta SAIU do motor — o tipo fica só como
 *      histórico dos alertas já gravados.
 *  D.4 Nenhum dos dois → 0% + alerta 'comissao_nao_definida'. Pedido emitido normalmente.
 *  D.5 Item sem produto vinculado (pendência de vínculo) → não resolve nem alerta (devolve null).
 *
 * A comissão resolvida é gravada no item na emissão pelo banco (cálculo da Fase 7). Comissão de item já gravado
 * NUNCA é recalculada ao editar cadastros.
 */

export const TIPOS_ALERTA = ["desconto_acima_limite", "preco_divergente", "comissao_nao_definida", "comissao_catalogo_sem_representada"] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];
export type TipoAlertaComissao = Extract<TipoAlerta, "comissao_nao_definida" | "comissao_catalogo_sem_representada">;
export const STATUS_ALERTA = ["pendente", "aprovado", "corrigido", "resolvido_auto"] as const;
export type StatusAlerta = (typeof STATUS_ALERTA)[number];

export const ROTULO_TIPO_ALERTA: Record<TipoAlerta, string> = {
  desconto_acima_limite: "Desconto acima do limite",
  preco_divergente: "Preço divergente do catálogo",
  comissao_nao_definida: "Comissão não definida",
  comissao_catalogo_sem_representada: "Representada sem comissão",
};
export const ROTULO_STATUS_ALERTA: Record<StatusAlerta, string> = {
  pendente: "Pendente", aprovado: "Aprovado", corrigido: "Corrigido", resolvido_auto: "Resolvido automaticamente",
};
/** Severidade: amarelo = política comercial (desconto), laranja = preço, vermelho = valor financeiro (comissão). */
export const NIVEL_TIPO_ALERTA: Record<TipoAlerta, NivelAviso> = {
  desconto_acima_limite: "amarelo", preco_divergente: "laranja", comissao_nao_definida: "vermelho", comissao_catalogo_sem_representada: "vermelho",
};

export type OrigemComissao = "representada" | "catalogo" | "zero";
export type ResultadoComissao = {
  percentual: number;
  origem: OrigemComissao;
  tipoAlerta: TipoAlertaComissao | null;
  oferecerPropagacao: boolean;
  /** D.1: os dois cadastros definidos e diferentes (sem alerta; só registro) */
  divergencia: boolean;
};

const definida = (v: number | null | undefined): v is number => v != null && Number(v) > 0;

export function resolverComissao(
  produto: { comissao: number | null | undefined } | null | undefined,
  representada: { comissao_percentual: number | null | undefined },
): ResultadoComissao | null {
  if (!produto) return null; // D.5
  const cat = produto.comissao;
  const rep = representada.comissao_percentual;
  if (definida(rep) && definida(cat)) return { percentual: Number(rep), origem: "representada", tipoAlerta: null, oferecerPropagacao: false, divergencia: Number(rep) !== Number(cat) };
  if (definida(rep)) return { percentual: Number(rep), origem: "representada", tipoAlerta: null, oferecerPropagacao: true, divergencia: false };
  // Fase 21 (A.2): representada vazia + catálogo definido usa o catálogo SEM alerta
  if (definida(cat)) return { percentual: Number(cat), origem: "catalogo", tipoAlerta: null, oferecerPropagacao: false, divergencia: false };
  return { percentual: 0, origem: "zero", tipoAlerta: "comissao_nao_definida", oferecerPropagacao: false, divergencia: false };
}

/* ---------- Fase 20: Comissão (R$) do item ---------- */

/** C.1 — texto exato do tooltip da coluna "Comissão (R$)". */
export const DICA_COMISSAO =
  "A comissão é calculada automaticamente pelo percentual do produto ou da representada. Se houver divergência de valor, você pode alterar a comissão após o lançamento do pedido na página de Comissões.";

/**
 * Fase 20 — comissão do item em R$ (somente leitura): subtotal × percentual, 2 casas — o MESMO cálculo que o banco
 * grava em pedido_itens.comissao_valor na emissão (o subtotal já considera desconto e acréscimo). Nunca entra no total.
 */
export const comissaoItem = (subtotal: number, percentual: number) => Math.round(subtotal * percentual) / 100;

/* ---------- Avisos durante o preenchimento (estado do formulário; nada é gravado) ---------- */

export type NivelAviso = "amarelo" | "laranja" | "vermelho" | "neutro";
export type AvisoItem =
  | { tipo: "desconto_acima_limite"; nivel: "amarelo"; mensagem: string }
  | { tipo: "preco_divergente"; nivel: "laranja"; mensagem: string; precoCatalogo: number }
  | { tipo: TipoAlertaComissao; nivel: "vermelho"; mensagem: string }
  | { tipo: "propagacao"; nivel: "neutro"; mensagem: string; percentual: number };

export type EntradaAvisos = {
  /** origem do pedido: false = importado por Excel (sem avisos de desconto, preço e propagação — G) */
  manual: boolean;
  quantidade: number;
  preco: number;
  desconto: number;
  /** preço de referência do catálogo (tabela do cliente > padrão); nulo/0 = sem comparação */
  precoCatalogo: number | null;
  /** desconto máximo da tabela de preços; nulo/0 = sem limite */
  descontoMax: number | null;
  /** null = item sem produto vinculado (D.5) */
  comissaoCatalogo: number | null | undefined;
  temProduto: boolean;
  comissaoRepresentada: number | null | undefined;
  /** % já gravado no item (edição): comissão definida no item resolve "não definida" (H.4) */
  comissaoItem?: number | null;
};

export function avisosDoItem(e: EntradaAvisos): AvisoItem[] {
  if (!(e.quantidade > 0)) return [];
  const avisos: AvisoItem[] = [];
  if (e.manual) {
    if (definida(e.descontoMax) && e.desconto > e.descontoMax) {
      avisos.push({ tipo: "desconto_acima_limite", nivel: "amarelo", mensagem: `Desconto de ${formatarPercentual(e.desconto)} acima do máximo permitido (${formatarPercentual(e.descontoMax)}).` });
    }
    if (definida(e.precoCatalogo) && Math.abs(e.preco - e.precoCatalogo) >= 0.005) {
      avisos.push({ tipo: "preco_divergente", nivel: "laranja", mensagem: `Preço ${formatarMoeda(e.preco)} difere do catálogo (${formatarMoeda(e.precoCatalogo)}).`, precoCatalogo: e.precoCatalogo });
    }
  }
  const c = e.temProduto ? resolverComissao({ comissao: e.comissaoCatalogo }, { comissao_percentual: e.comissaoRepresentada }) : null;
  if (c?.tipoAlerta === "comissao_nao_definida" && !definida(e.comissaoItem)) {
    avisos.push({ tipo: "comissao_nao_definida", nivel: "vermelho", mensagem: "Comissão não definida — este pedido ficará com comissão zero. Defina a comissão em Representadas ou no Catálogo." });
  } else if (c?.tipoAlerta === "comissao_catalogo_sem_representada") {
    avisos.push({
      tipo: "comissao_catalogo_sem_representada", nivel: "vermelho",
      mensagem: `Comissão de ${formatarPercentual(c.percentual)} aplicada do Catálogo, mas a Representada não tem comissão definida. Padronize o cadastro da representada.`,
    });
  } else if (c?.oferecerPropagacao && e.manual) {
    avisos.push({ tipo: "propagacao", nivel: "neutro", mensagem: `Comissão de ${formatarPercentual(c.percentual)} aplicada da Representada. O Catálogo deste produto está sem comissão.`, percentual: c.percentual });
  }
  return avisos;
}

/* ---------- Quadro de divergências ---------- */

export type ValoresAlerta = {
  produto_id?: string;
  desconto_aplicado?: number; desconto_maximo?: number;
  preco_praticado?: number; preco_catalogo?: number;
  representada_id?: string; comissao_representada?: number | null; comissao_catalogo?: number | null; origem_escolhida?: OrigemComissao;
};

/** "Valor praticado" × "Valor de referência" da linha do quadro (ou o texto da comissão). */
export function descreverAlerta(tipo: TipoAlerta, v: ValoresAlerta): { praticado: string; referencia: string; diferenca: number } {
  const n = (x: number | null | undefined) => Number(x ?? 0);
  switch (tipo) {
    case "desconto_acima_limite":
      return { praticado: `Desconto ${formatarPercentual(n(v.desconto_aplicado))}`, referencia: `Máximo ${formatarPercentual(n(v.desconto_maximo))}`, diferenca: n(v.desconto_aplicado) - n(v.desconto_maximo) };
    case "preco_divergente":
      return { praticado: formatarMoeda(n(v.preco_praticado)), referencia: `Catálogo ${formatarMoeda(n(v.preco_catalogo))}`, diferenca: Math.abs(n(v.preco_praticado) - n(v.preco_catalogo)) };
    case "comissao_catalogo_sem_representada":
      return { praticado: `${formatarPercentual(n(v.comissao_catalogo))} do Catálogo`, referencia: "Representada sem comissão", diferenca: n(v.comissao_catalogo) };
    case "comissao_nao_definida":
      return { praticado: "Comissão 0%", referencia: "Sem comissão na Representada nem no Catálogo", diferenca: 0 };
  }
}

/* ---------- Filtros do quadro (URL: a_tipo, a_status — pendente por padrão —, a_ordem) ---------- */
const umValor = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const opcional = <T extends z.ZodType>(s: T, padrao: z.infer<T> | null) =>
  z.preprocess((v) => { const x = umValor(v); return x === "" || x == null ? undefined : x; }, s.optional().catch(undefined))
    .transform((v) => (v === undefined ? padrao : v));

export const filtroAlertasSchema = z.object({
  a_tipo: opcional(z.enum(TIPOS_ALERTA), null),
  a_status: opcional(z.enum(STATUS_ALERTA), "pendente"),
  a_ordem: opcional(z.enum(["data", "diferenca"]), "data"),
});
export type FiltroAlertas = { a_tipo: TipoAlerta | null; a_status: StatusAlerta; a_ordem: "data" | "diferenca" };

