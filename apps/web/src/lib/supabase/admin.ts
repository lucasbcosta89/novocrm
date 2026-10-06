import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export function supabaseAdmin() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
