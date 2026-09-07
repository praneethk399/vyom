import type { StandardAlert } from '../models/alert';

/**
 * Alert storage + SMS dedup. In-memory by design — the project has no
 * database and Supabase is configured only for client-side auth, so alerts do
 * not yet persist across restarts. `recordAlert` / `recentAlerts` shape the
 * GET /api/alerts history; `smsDuplicate` / `markSmsSent` enforce the 5-minute
 * per (engine, alertType) SMS window across every entry point.
 */

const HISTORY_MAX = 100;
const SMS_TTL_MS = 5 * 60 * 1000;

const history: StandardAlert[] = [];
const smsSentAt = new Map<string, number>();

export function recordAlert(alert: StandardAlert): StandardAlert {
  history.unshift(alert);
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  return alert;
}

export function recentAlerts(limit = 50): StandardAlert[] {
  return history.slice(0, Math.max(1, Math.min(history.length, limit)));
}

export function smsDuplicate(alertType: string, engineId: string): boolean {
  const at = smsSentAt.get(`${alertType}:${engineId}`);
  return at !== undefined && Date.now() - at < SMS_TTL_MS;
}

export function markSmsSent(alertType: string, engineId: string): void {
  smsSentAt.set(`${alertType}:${engineId}`, Date.now());
}