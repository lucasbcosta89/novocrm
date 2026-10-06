import { rota } from "@/server/rota";
import { listarComissoes, resumirComissoes } from "@/server/comissoes";

/** ?representada_id=&status= → { resumo, comissoes } */
export const GET = rota(async (ctx, { req }) => {
  const sp = req.nextUrl.searchParams;
  const comissoes = await listarComissoes(ctx, {
    representada_id: sp.get("representada_id") ?? undefined,
    status: sp.get("status") ?? undefined,
  });
  return { resumo: resumirComissoes(comissoes), comissoes };
});
