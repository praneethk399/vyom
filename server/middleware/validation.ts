import type { RequestHandler } from 'express';
import { isScenarioName, type ScenarioName } from '../models/telemetry';
import type { StandardAlert } from '../models/alert';

/** Validate the scenario body value; returns the scenario name or null. */
export function validateScenario(v: unknown): ScenarioName | null {
  return isScenarioName(v) ? v : null;
}

const SEVERITIES = ['NORMAL', 'WARNING', 'CRITICAL'] as const;

/** Validate + coerce a standardized alert POST body; returns null when invalid. */
export function validateAlertBody(b: unknown): StandardAlert | null {
  if (typeof b !== 'object' || b === null) return null;
  const a = b as Record<string, unknown>;
  if (
    typeof a.alertType !== 'string' ||
    typeof a.severity !== 'string' ||
    !(SEVERITIES as readonly string[]).includes(a.severity) ||
    typeof a.engineId !== 'string'
  ) {
    return null;
  }
  return {
    id: `alert:${Date.now()}`,
    alertType: a.alertType,
    severity: a.severity as StandardAlert['severity'],
    engineId: a.engineId,
    parameter: typeof a.parameter === 'string' ? a.parameter : undefined,
    value: typeof a.value === 'number' ? a.value : undefined,
    threshold: typeof a.threshold === 'number' ? a.threshold : undefined,
    scenario: typeof a.scenario === 'string' ? a.scenario : 'unknown',
    timestamp: typeof a.timestamp === 'string' ? a.timestamp : new Date().toISOString(),
  };
}

/** Minimal fixed-window per-IP rate limiter (no dependency): 429 on excess. */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ ok: false, error: 'rate limit exceeded — slow down' });
      return;
    }
    next();
  };
}