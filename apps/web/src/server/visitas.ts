import { idSchema, visitaSchema, visitaUpdateSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { AppError, erroBanco } from "./erros";

export type Visita = {
  id: string;
  cliente_id: string;
  representada_id: string | null;
  data: string;
  tipo: string;
  anotacoes: string | null;
  resultado: string | null;
  representada: { nome: string } | null;
};

const CAMPOS = "id, cliente_id, representada_id, data, tipo, anotacoes, resultado, representada:representadas(nome)";

function erroVisita(error: Parameters<typeof erroBanco>[0]) {
  // RLS (with check) falha quando cliente/representada não são do usuário.
  return error.code === "42501" ? new AppError(400, "Cliente ou representada inválidos", "referencia_invalida") : erroBanco(error);
}

export async function listarVisitas({ supabase }: Contexto, clienteId: string): Promise<Visita[]> {
  const { data, error } = await supabase
    .from("visitas")
    .select(CAMPOS)
    .eq("cliente_id", idSchema.parse(clienteId))
    .order("data", { ascending: false })
    .returns<Visita[]>();
  if (error) throw erroBanco(error);
  return data;
}

export async function obterVisita({ supabase }: Contexto, id: string): Promise<Visita> {
  const { data, error } = await supabase.from("visitas").select(CAMPOS).eq("id", idSchema.parse(id)).single<Visita>();
  if (error) throw erroBanco(error);
  return data;
}

export async function criarVisita({ supabase, userId }: Contexto, clienteId: string, input: unknown): Promise<Visita> {
  const dados = visitaSchema.parse(input);
  const { data, error } = await supabase
    .from("visitas")
    .insert({ ...dados, cliente_id: idSchema.parse(clienteId), user_id: userId })
    .select(CAMPOS)
    .single<Visita>();
  if (error) throw erroVisita(error);
  return data;
}

export async function atualizarVisita({ supabase }: Contexto, id: string, input: unknown): Promise<Visita> {
  const dados = visitaUpdateSchema.parse(input);
  const { data, error } = await supabase
    .from("visitas")
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq("id", idSchema.parse(id))
    .select(CAMPOS)
    .single<Visita>();
  if (error) throw erroVisita(error);
  return data;
}

export async function excluirVisita({ supabase }: Contexto, id: string): Promise<void> {
  const { error, count } = await supabase.from("visitas").delete({ count: "exact" }).eq("id", idSchema.parse(id));
  if (error) throw erroBanco(error);
  if (!count) throw new AppError(404, "Não encontrado", "nao_encontrado");
}
