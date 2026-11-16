import "server-only";
import { z } from "zod";
import { DESCONTO_MAX_PADRAO } from "@/lib/desconto";
import type { Contexto } from "./contexto";
import { erroBanco } from "./erros";

/** Fase 17.1 (F) — configuração global de pedidos do usuário: desconto máximo padrão (3º nível da cascata). */
export type ConfiguracaoPedidos = { desconto_max_padrao: number };

export async function obterConfiguracaoPedidos({ supabase, userId }: Contexto): Promise<ConfiguracaoPedidos> {
  const { data, error } = await supabase.from("usuarios").select("desconto_max_padrao").eq("id", userId).maybeSingle<{ desconto_max_padrao: number | null }>();
  if (error) throw erroBanco(error);
  return { desconto_max_padrao: data?.desconto_max_padrao == null ? DESCONTO_MAX_PADRAO : Number(data.desconto_max_padrao) };
}

const descontoSchema = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v),
  z.number("Desconto máximo deve ser um número de 0 a 100").min(0, "Desconto máximo deve estar entre 0 e 100").max(100, "Desconto máximo deve estar entre 0 e 100"),
);

export async function salvarConfiguracaoPedidos({ supabase, userId }: Contexto, valor: unknown): Promise<void> {
  const desconto = descontoSchema.parse(valor);
  const { error } = await supabase.from("usuarios").update({ desconto_max_padrao: desconto }).eq("id", userId);
  if (error) throw erroBanco(error);
}
