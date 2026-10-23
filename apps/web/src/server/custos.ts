import "server-only";
import { despesaSchema, totalDistinto, type DespesaLinha } from "@/lib/custos";
import { idSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

type Row = {
  id: string; descricao: string; data: string; valor: number; observacoes: string | null;
  representadas: { representada: { id: string; nome: string } | null }[];
  clientes: { cliente: { id: string; nome: string } | null }[];
};
const CAMPOS =
  "id, descricao, data, valor, observacoes, representadas:despesa_representadas(representada:representadas(id, nome)), clientes:despesa_clientes(cliente:clientes(id, nome))";

const mapear = (r: Row): DespesaLinha => ({
  id: r.id, descricao: r.descricao, data: r.data, valor: Number(r.valor), observacoes: r.observacoes,
  representadas: r.representadas.flatMap((x) => (x.representada ? [x.representada] : [])).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  clientes: r.clientes.flatMap((x) => (x.cliente ? [x.cliente] : [])).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
});

export type FiltroCustos = { de: string; ate: string; representadas: string[]; clientes: string[] };

/**
 * Despesas do período (data desc). Filtro por representada/cliente: a despesa entra se tiver
 * vínculo com QUALQUER um dos selecionados.
 */
export async function listarDespesas({ supabase }: Contexto, f: FiltroCustos): Promise<DespesaLinha[]> {
  const { data, error } = await supabase
    .from("despesas")
    .select(CAMPOS)
    .gte("data", f.de)
    .lte("data", f.ate)
    .order("data", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(5000)
    .returns<Row[]>();
  if (error) throw erroBanco(error);
  const reps = new Set(f.representadas);
  const clis = new Set(f.clientes);
  return data
    .map(mapear)
    .filter((d) => (!reps.size || d.representadas.some((r) => reps.has(r.id))) && (!clis.size || d.clientes.some((c) => clis.has(c.id))));
}

/**
 * Resumo com os mesmos filtros: custos (cada despesa uma vez), resultado bruto (comissões
 * recebidas com data prevista no período — mesmo critério do dashboard) e líquido = bruto − custos.
 */
export async function resumoCustos(ctx: Contexto, f: FiltroCustos, despesas: DespesaLinha[]) {
  let q = ctx.supabase
    .from("comissoes")
    .select("valor, pedido:pedidos!inner(cliente_id)")
    .eq("status", "recebida")
    .gte("data_prevista", `${f.de}T00:00:00-03:00`)
    .lte("data_prevista", `${f.ate}T23:59:59.999-03:00`);
  if (f.representadas.length) q = q.in("representada_id", f.representadas);
  if (f.clientes.length) q = q.in("pedido.cliente_id", f.clientes);
  const { data, error } = await q.limit(5000).returns<{ valor: number }[]>();
  if (error) throw erroBanco(error);
  const custos = totalDistinto(despesas);
  const bruto = Math.round(data.reduce((s, c) => s + Number(c.valor), 0) * 100) / 100;
  return { custos, bruto, liquido: Math.round((bruto - custos) * 100) / 100 };
}

/** Regrava os vínculos (apaga e insere) — RLS garante que representada/cliente são do usuário. */
async function vincular({ supabase }: Contexto, id: string, representadas: string[], clientes: string[]) {
  const apagar = await Promise.all([
    supabase.from("despesa_representadas").delete().eq("despesa_id", id),
    supabase.from("despesa_clientes").delete().eq("despesa_id", id),
  ]);
  for (const r of apagar) if (r.error) throw erroBanco(r.error);
  const inserir = await Promise.all([
    representadas.length ? supabase.from("despesa_representadas").insert(representadas.map((r) => ({ despesa_id: id, representada_id: r }))) : null,
    clientes.length ? supabase.from("despesa_clientes").insert(clientes.map((c) => ({ despesa_id: id, cliente_id: c }))) : null,
  ]);
  for (const r of inserir) if (r?.error) throw r.error.code === "42501" ? new AppError(400, "Representada ou cliente inválido", "referencia_invalida") : erroBanco(r.error);
}

export async function criarDespesa(ctx: Contexto, input: unknown): Promise<string> {
  const { representadas, clientes, ...dados } = despesaSchema.parse(input);
  const { data, error } = await ctx.supabase.from("despesas").insert({ ...dados, user_id: ctx.userId }).select("id").single<{ id: string }>();
  if (error) throw erroBanco(error);
  try {
    await vincular(ctx, data.id, representadas, clientes);
  } catch (e) {
    await ctx.supabase.from("despesas").delete().eq("id", data.id); // não deixa despesa pela metade
    throw e;
  }
  return data.id;
}

export async function atualizarDespesa(ctx: Contexto, id: string, input: unknown): Promise<void> {
  const { representadas, clientes, ...dados } = despesaSchema.parse(input);
  const { error, count } = await ctx.supabase.from("despesas").update(dados, { count: "exact" }).eq("id", idSchema.parse(id));
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Despesa não encontrada", "nao_encontrado");
  await vincular(ctx, id, representadas, clientes);
}

/** Excluir apaga os vínculos em cascata (FK on delete cascade). */
export async function excluirDespesa({ supabase }: Contexto, id: string): Promise<void> {
  const { error, count } = await supabase.from("despesas").delete({ count: "exact" }).eq("id", idSchema.parse(id));
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Despesa não encontrada", "nao_encontrado");
}
