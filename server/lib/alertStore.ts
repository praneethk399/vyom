/**
 * Shared in-memory alert store: keeps recent alerts for GET /api/alerts and
 * enforces the 5-minute per (alertType, engine) SMS dedup window across every
 * entry point (simulation, direct POST, dev test endpoint).
 *
 * In-memory by design — this project has no database; a restart resets it.
 */

import type { StandardAlert } from './alertEngine';

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

/** Mark an SMS as sent (opens the dedup window). */
export function markSmsSent(alertType: string, engineId: string): void {
  smsSentAt.set(`${alertType}:${engineId}`, Date.now());
}
