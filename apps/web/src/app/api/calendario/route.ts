import { listarEventos, reagendarEvento } from "@/server/calendario";
import { lerJson, rota } from "@/server/rota";

/** GET ?inicio=AAAA-MM-DD&fim=AAAA-MM-DD&tipos=visita,subtarefa,tarefa → eventos normalizados (agenda unificada). */
export const GET = rota(async (ctx, { req }) => {
  const p = req.nextUrl.searchParams;
  return listarEventos(ctx, { inicio: p.get("inicio"), fim: p.get("fim"), tipos: p.get("tipos") ?? undefined });
});

/** PATCH { tipo, id, data } → reagenda na origem (visitas.data, plano_acao.prazo ou tarefas.data). */
export const PATCH = rota(async (ctx, { req }) => reagendarEvento(ctx, await lerJson(req)));
