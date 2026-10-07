import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

let cache: Env | undefined;

const mpSchema = z.object({
  MP_ACCESS_TOKEN: z.string().min(1, "MP_ACCESS_TOKEN não configurado"),
  MP_WEBHOOK_SECRET: z.string().optional(),
  /** E-mail do comprador de teste do MP (sandbox); em produção usa o e-mail do usuário. */
  MP_TEST_PAYER_EMAIL: z.email().optional().or(z.literal("").transform(() => undefined)),
  CRON_SECRET: z.string().optional(),
});

/** Variáveis do Mercado Pago: lidas sob demanda para não derrubar o app se faltarem. */
export function envMp() {
  return mpSchema.parse(process.env);
}

export function env(): Env {
  cache ??= envSchema.parse(process.env);
  return cache;
}
