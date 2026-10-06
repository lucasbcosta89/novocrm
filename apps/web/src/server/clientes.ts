import { clienteSchema, clienteUpdateSchema, idSchema, vinculoSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";
import { verificarLimite } from "./quota";

export type Cliente = {
  id: string;
  nome: string;
  documento: string | null;
  email: string | null;
  celular: string | null;
  whatsapp: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  segmento: string | null;
  anotacoes: string | null;
  status: string;
  criado_em: string;
  representadas: { id: string; nome: string }[];
};

type ClienteRow = Omit<Cliente, "representadas"> & {
  cliente_representada: { representadas: { id: string; nome: string } | null }[];
};

const CAMPOS =
  "id, nome, documento, email, celular, whatsapp, cidade, uf, cep, segmento, anotacoes, status, criado_em, cliente_representada(representadas(id, nome))";
const DUPLICADO = "Já existe cliente com este CPF/CNPJ";

function mapear({ cliente_representada, ...c }: ClienteRow): Cliente {
  return {
    ...c,
    representadas: cliente_representada.flatMap((v) => (v.representadas ? [v.representadas] : [])),
  };
}

export async function listarClientes({ supabase }: Contexto): Promise<Cliente[]> {
  const { data, error } = await supabase.from("clientes").select(CAMPOS).order("nome").returns<ClienteRow[]>();
  if (error) throw erroBanco(error);
  return data.map(mapear);
}

export async function obterCliente({ supabase }: Contexto, id: string): Promise<Cliente> {
  const { data, error } = await supabase
    .from("clientes")
    .select(CAMPOS)
    .eq("id", idSchema.parse(id))
    .single<ClienteRow>();
  if (error) throw erroBanco(error);
  return mapear(data);
}

export async function criarCliente(ctx: Contexto, input: unknown): Promise<Cliente> {
  const dados = clienteSchema.parse(input);
  await verificarLimite(ctx, "clientes");
  const { data, error } = await ctx.supabase
    .from("clientes")
    .insert({ ...dados, user_id: ctx.userId })
    .select(CAMPOS)
    .single<ClienteRow>();
  if (error) throw erroBanco(error, DUPLICADO);
  return mapear(data);
}

export async function atualizarCliente({ supabase }: Contexto, id: string, input: unknown): Promise<Cliente> {
  const dados = clienteUpdateSchema.parse(input);
  const { data, error } = await supabase
    .from("clientes")
    .update(dados)
    .eq("id", idSchema.parse(id))
    .select(CAMPOS)
    .single<ClienteRow>();
  if (error) throw erroBanco(error, DUPLICADO);
  return mapear(data);
}

export async function excluirCliente({ supabase }: Contexto, id: string): Promise<void> {
  const { error, count } = await supabase.from("clientes").delete({ count: "exact" }).eq("id", idSchema.parse(id));
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Não encontrado", "nao_encontrado");
}

/** Vincula o cliente a uma representada (idempotente). */
export async function vincular(ctx: Contexto, clienteId: string, representadaId: string): Promise<Cliente> {
  const cliente_id = idSchema.parse(clienteId);
  const { error } = await ctx.supabase
    .from("cliente_representada")
    .upsert(
      { cliente_id, representada_id: idSchema.parse(representadaId) },
      { onConflict: "cliente_id,representada_id", ignoreDuplicates: true },
    );
  if (error) throw error.code === "42501" ? new AppError(404, "Cliente ou representada não encontrados", "nao_encontrado") : erroBanco(error);
  return obterCliente(ctx, cliente_id);
}

/** Remove o vínculo cliente ↔ representada (idempotente). */
export async function desvincular(ctx: Contexto, clienteId: string, representadaId: string): Promise<Cliente> {
  const cliente_id = idSchema.parse(clienteId);
  const { error } = await ctx.supabase
    .from("cliente_representada")
    .delete()
    .eq("cliente_id", cliente_id)
    .eq("representada_id", idSchema.parse(representadaId));
  if (error) throw erroBanco(error);
  return obterCliente(ctx, cliente_id);
}

/** Define o conjunto exato de representadas do cliente (substitui os vínculos anteriores). */
export async function vincularRepresentadas(ctx: Contexto, clienteId: string, input: unknown): Promise<Cliente> {
  const id = idSchema.parse(clienteId);
  const ids = [...new Set(vinculoSchema.parse(input).representada_ids)];
  await obterCliente(ctx, id); // 404 se não for do usuário

  const remover = ctx.supabase.from("cliente_representada").delete().eq("cliente_id", id);
  const { error: delError } = await (ids.length ? remover.not("representada_id", "in", `(${ids.join(",")})`) : remover);
  if (delError) throw erroBanco(delError);

  if (ids.length) {
    const { error } = await ctx.supabase
      .from("cliente_representada")
      .upsert(
        ids.map((representada_id) => ({ cliente_id: id, representada_id })),
        { onConflict: "cliente_id,representada_id", ignoreDuplicates: true },
      );
    if (error) throw error.code === "42501" ? new AppError(400, "Representada inválida", "representada_invalida") : erroBanco(error);
  }
  return obterCliente(ctx, id);
}
