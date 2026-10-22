import "server-only";
import { idSchema, tarefaUpdateSchema } from "@/lib/validacao";
import type { Contexto } from "./contexto";
import { erroBanco } from "./erros";

export type Tarefa = { id: string; titulo: string; data: string | null; concluida: boolean; tipo: string | null; cliente: { id: string; nome: string } | null };
const CAMPOS = "id, titulo, data, concluida, tipo, cliente:clientes(id, nome)";

export async function obterTarefa({ supabase }: Contexto, id: string): Promise<Tarefa> {
  const { data, error } = await supabase.from("tarefas").select(CAMPOS).eq("id", idSchema.parse(id)).single<Tarefa>();
  if (error) throw erroBanco(error);
  return data;
}

/** Edita título, data e conclusão (RLS: só tarefas do próprio usuário). */
export async function atualizarTarefa({ supabase }: Contexto, id: string, input: unknown): Promise<Tarefa> {
  const dados = tarefaUpdateSchema.parse(input);
  const { data, error } = await supabase.from("tarefas").update(dados).eq("id", idSchema.parse(id)).select(CAMPOS).single<Tarefa>();
  if (error) throw erroBanco(error);
  return data;
}
