import { rota } from "@/server/rota";
import { idSchema } from "@/lib/validacao";
import { erroBanco } from "@/server/erros";

/** Status de geração de um PDF do usuário (o botão "Gerar Catálogo PDF" acompanha até ficar pronto). */
export const GET = rota<{ id: string }>(async ({ supabase }, { params }) => {
  const { data, error } = await supabase
    .from("documentos")
    .select("status, erro")
    .eq("id", idSchema.parse(params.id))
    .single<{ status: string; erro: string | null }>();
  if (error) throw erroBanco(error);
  return data;
});
