import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Supabase client (email + password auth). Null when not configured — the
 *  app then falls back to local demo auth so the twin still runs offline. */
export const supabase: SupabaseClient | null =
  url && anon ? createClient(url, anon) : null;

export const authConfigured = supabase !== null;

/**
 * Authorization header carrying the current Supabase session's access token,
 * for API calls gated behind requireSupabaseAuth(). Returns an empty object
 * when there is no session or Supabase is unconfigured (demo mode) — the
 * server passes those through, so the offline twin keeps working.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
