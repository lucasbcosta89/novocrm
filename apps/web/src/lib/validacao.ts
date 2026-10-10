import { z } from "zod";

export const soDigitos = (v: string) => v.replace(/\D/g, "");

/** "" (campo de formulário vazio) vira null = limpar o campo. */
const vazioParaNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const textoOpcional = (max: number) => z.preprocess(vazioParaNull, z.string().trim().max(max).nullable().optional());

const digitosOpcional = (tamanhos: number[], msg: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? vazioParaNull(soDigitos(v)) : v),
    z
      .string()
      .refine((d) => tamanhos.includes(d.length), msg)
      .nullable()
      .optional(),
  );

const numero = (min: number, max: number, msg: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v),
    z.number(msg).min(min, msg).max(max, msg),
  );

type SemPadrao<T> = T extends z.ZodDefault<infer I> ? I : T;
type ShapeParcial<T extends z.ZodRawShape> = { [K in keyof T]: z.ZodOptional<SemPadrao<T[K]>> };

/** Como .partial(), mas sem os defaults: PATCH só altera os campos enviados. */
function parcial<T extends z.ZodRawShape>(schema: z.ZodObject<T>): z.ZodObject<ShapeParcial<T>> {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([k, v]) => [k, ((v instanceof z.ZodDefault ? v.unwrap() : v) as z.ZodType).optional()]),
  );
  return z.object(shape) as unknown as z.ZodObject<ShapeParcial<T>>;
}

export const idSchema = z.uuid("ID inválido");

export const representadaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(120),
  cnpj: digitosOpcional([14], "CNPJ deve ter 14 dígitos"),
  comissao_padrao: numero(0, 100, "Comissão deve estar entre 0 e 100").default(0),
  catalogo_publico: z.boolean().optional(),
  criar_pedido_publico: z.boolean().optional(),
});
export const representadaUpdateSchema = parcial(representadaSchema);

export const clienteSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(160),
  documento: digitosOpcional([11, 14], "CPF/CNPJ deve ter 11 ou 14 dígitos"),
  email: z.preprocess(vazioParaNull, z.email("E-mail inválido").trim().toLowerCase().nullable().optional()),
  celular: textoOpcional(30),
  whatsapp: textoOpcional(30),
  cidade: textoOpcional(80),
  uf: z.preprocess(
    (v) => (typeof v === "string" ? vazioParaNull(v.trim().toUpperCase()) : v),
    z.string().regex(/^[A-Z]{2}$/, "UF deve ter 2 letras").nullable().optional(),
  ),
  cep: digitosOpcional([8], "CEP deve ter 8 dígitos"),
  segmento: textoOpcional(80),
  anotacoes: textoOpcional(2000),
});
export const clienteUpdateSchema = parcial(clienteSchema);

export const vinculoSchema = z.object({
  representada_ids: z.array(idSchema).max(200),
});

export const produtoSchema = z.object({
  sku: z.string().trim().min(1, "Informe o SKU").max(60),
  nome: z.string().trim().min(2, "Informe o nome").max(160),
  descricao: textoOpcional(2000),
  unidade: textoOpcional(20),
  categoria: textoOpcional(60),
  preco: numero(0, 99_999_999, "Preço inválido"),
  desconto_max: numero(0, 100, "Desconto máximo deve estar entre 0 e 100").default(0),
  /** % de comissão do produto; se omitido, usa a comissão padrão da representada. */
  comissao: numero(0, 100, "Comissão deve estar entre 0 e 100").optional(),
  ativo: z.preprocess((v) => (v === "on" ? true : v === "off" ? false : v), z.boolean()).default(true),
});
export const produtoUpdateSchema = parcial(produtoSchema);

export function slugify(texto: string): string {
  const slug = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "representada";
}

export function primeiroErroZod(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos";
}

export const TIPOS_VISITA = ["presencial", "telefone", "whatsapp", "video"] as const;

/** "2026-10-06T14:30" (datetime-local, horário de Brasília) ou ISO completo → ISO com offset. */
const dataHora = z.preprocess(
  (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00-03:00` : v),
  z.iso.datetime({ offset: true, message: "Data/hora inválida" }),
);

export const visitaSchema = z.object({
  data: dataHora,
  tipo: z.enum(TIPOS_VISITA, "Tipo de visita inválido").default("presencial"),
  representada_id: z.preprocess(vazioParaNull, idSchema.nullable().optional()),
  anotacoes: textoOpcional(4000),
  resultado: textoOpcional(1000),
});
export const visitaUpdateSchema = parcial(visitaSchema);

export const TIPOS_OPORTUNIDADE = ["oportunidade", "desafio"] as const;
export const PRIORIDADES = ["baixa", "media", "alta"] as const;
/** Status unificados (Fase 4b) para oportunidades e ações do plano. */
export const STATUS_OPORTUNIDADE = ["nao_iniciado", "em_progresso", "atrasado", "cancelado", "concluido"] as const;
export const STATUS_ACAO = STATUS_OPORTUNIDADE;
export const RESULTADOS = ["ganhou", "perdeu"] as const;

export const oportunidadeSchema = z.object({
  tipo: z.enum(TIPOS_OPORTUNIDADE, "Tipo inválido"),
  titulo: z.string().trim().min(2, "Informe o título").max(200),
  descricao: textoOpcional(4000),
  valor_estimado: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? null : Number(v.replace(",", "."))) : v),
    z.number("Valor estimado inválido").min(0, "Valor estimado inválido").max(999_999_999_999).nullable().optional(),
  ),
  prioridade: z.enum(PRIORIDADES, "Prioridade inválida").default("media"),
  status: z.enum(STATUS_OPORTUNIDADE, "Status inválido").default("nao_iniciado"),
  representada_id: z.preprocess(vazioParaNull, idSchema.nullable().optional()),
  cidade: textoOpcional(80),
  estado: z.preprocess(
    (v) => (typeof v === "string" ? vazioParaNull(v.trim().toUpperCase()) : v),
    z.string().regex(/^[A-Z]{2}$/, "Estado (UF) deve ter 2 letras").nullable().optional(),
  ),
});
export const oportunidadeUpdateSchema = parcial(oportunidadeSchema);

export const acaoSchema = z.object({
  descricao: z.string().trim().min(2, "Descreva a ação").max(1000),
  responsavel: textoOpcional(120),
  prazo: z.preprocess(vazioParaNull, z.iso.date("Prazo inválido").nullable().optional()),
  status: z.enum(STATUS_ACAO, "Status inválido").default("nao_iniciado"),
  data_entrega: z.preprocess(vazioParaNull, z.iso.date("Data de entrega inválida").nullable().optional()),
  observacoes: textoOpcional(2000),
});
export const acaoUpdateSchema = parcial(acaoSchema);

export const STATUS_COMISSAO = ["a_receber", "recebida", "atrasada", "cancelada"] as const;

export const pedidoSchema = z.object({
  representada_id: idSchema,
  cliente_id: idSchema,
  forma_pagamento: textoOpcional(60),
  confirmar: z.boolean().default(false),
  itens: z
    .array(
      z.object({
        produto_id: idSchema,
        quantidade: numero(0.001, 1_000_000, "Quantidade inválida"),
        desconto: numero(0, 99_999_999, "Desconto inválido").default(0),
      }),
    )
    .min(1, "Adicione ao menos um item")
    .max(500),
});
export type PedidoInput = z.infer<typeof pedidoSchema>;

/** Status que o usuário pode definir manualmente (cancelada só via cancelamento do pedido). */
export const marcarComissaoSchema = z.object({
  status: z.enum(["a_receber", "recebida", "atrasada"], "Status inválido"),
});

/** Nova oportunidade pela página global (kanban): representada obrigatória, produtos dela e ações do plano. */
export const novaOportunidadeSchema = oportunidadeSchema.extend({
  tipo: z.enum(TIPOS_OPORTUNIDADE, "Tipo inválido").default("oportunidade"),
  representada_id: z.uuid("Selecione a representada"),
  produtos: z
    .array(z.object({ produto_id: idSchema, quantidade: numero(0.001, 1_000_000, "Quantidade inválida").default(1) }))
    .max(200)
    .default([])
    .refine((ps) => new Set(ps.map((p) => p.produto_id)).size === ps.length, "Produto repetido"),
  acoes: z.array(acaoSchema).max(100).default([]),
});

export const resultadoSchema = z.object({
  resultado: z.enum(RESULTADOS, "Selecione Ganhou ou Perdeu"),
  observacoes_resultado: textoOpcional(2000),
});

export const produtoOportunidadeSchema = z.object({
  produto_id: idSchema,
  quantidade: numero(0.001, 1_000_000, "Quantidade inválida").default(1),
});
