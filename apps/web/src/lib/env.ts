import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

let cache: Env | undefined;

export function env(): Env {
  cache ??= envSchema.parse(process.env);
  return cache;
}
