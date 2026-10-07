import { createClient } from "@supabase/supabase-js";
import Storage from "expo-sqlite/kv-store";

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
/** URL do CRM web (rotas /api/sync/*). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

/** Sessão persistida no próprio SQLite (kv-store do expo-sqlite). */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: Storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
