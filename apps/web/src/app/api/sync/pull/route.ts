import { rota } from "@/server/rota";
import { pull } from "@/server/sync";

/** GET ?since=<ISO> → alterações desde o último sync (Authorization: Bearer <token do Supabase>). */
export const GET = rota((ctx, { req }) => pull(ctx, req.nextUrl.searchParams.get("since")));
