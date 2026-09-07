import { createClient } from '@supabase/supabase-js';
import type { Request, RequestHandler, Response, NextFunction } from 'express';

/**
 * Supabase session gate for API routes.
 *
 * When Supabase is configured (URL + anon key present in the server env) every
 * request must carry `Authorization: Bearer <access_token>`. The token is
 * validated against the Supabase auth service via `auth.getUser(token)`; a
 * missing, malformed, expired or otherwise invalid session is rejected with
 * 401. When Supabase is NOT configured the middleware lets requests through —
 * that is the app's established demo mode (offline twin, rule-based
 * diagnostics, demo auth), so gating it would break the whole dashboard.
 *
 * Note the anon key is safe to hold server-side: it is the public client key,
 * and `getUser` only needs it (plus the project URL) to verify a session.
 */

function supabaseConfig(): { url: string; anon: string } | null {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const anon = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  return url && anon ? { url, anon } : null;
}

/** Requests that pass the gate carry the authenticated Supabase user. */
export interface AuthedRequest extends Request {
  supabaseUser?: { id: string; email?: string };
}

export function requireSupabaseAuth(): RequestHandler {
  const cfg = supabaseConfig();

  // Demo mode — no Supabase configured; keep the offline twin working.
  if (!cfg) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const client = createClient(cfg.url, cfg.anon);

  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ ok: false, error: 'unauthorized — sign in first' });
      return;
    }
    try {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) {
        res.status(401).json({ ok: false, error: 'unauthorized — invalid or expired session' });
        return;
      }
      req.supabaseUser = {
        id: data.user.id,
        email: data.user.email ?? undefined,
      };
      next();
    } catch (err) {
      console.error('[auth]', err instanceof Error ? err.message : err);
      res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  };
}