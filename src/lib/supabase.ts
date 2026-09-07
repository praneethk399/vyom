import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Supabase client (email + password auth). Null when not configured — the
 *  app then falls back to local demo auth so the twin still runs offline. */
export const supabase: SupabaseClient | null =
  url && anon ? createClient(url, anon) : null;

export const authConfigured = supabase !== null;
