import { Router } from 'express';
import type { StandardAlert } from '../lib/alertEngine';
import { recentAlerts } from '../lib/alertStore';
import { runAlertPipeline } from '../lib/alertPipeline';
import { rateLimit } from '../lib/rateLimit';

/**
 * Alert API:
 *   POST /api/alerts — ingest a standardized alert (validate, store, SMS for
 *                      WARNING/CRITICAL, 5-minute duplicate suppression)
 *   GET  /api/alerts — recent alert history for the dashboard
 */

const SEVERITIES = ['NORMAL', 'WARNING', 'CRITICAL'] as const;

interface AlertBody {
  alertType: unknown;
  severity: unknown;
  engineId: unknown;
  parameter?: unknown;
  value?: unknown;
  threshold?: unknown;
  timestamp?: unknown;
  scenario?: unknown;
}

function isAlertBody(b: unknown): b is AlertBody {
  if (typeof b !== 'object' || b === null) return false;
  const a = b as Record<string, unknown>;
  return (
    typeof a.alertType === 'string' &&
    typeof a.severity === 'string' &&
    (SEVERITIES as readonly string[]).includes(a.severity) &&
    typeof a.engineId === 'string'
  );
}

const router = Router();

router.get('/', (_req, res) => {
  const limit = Number((_req.query.limit as string) ?? 50);
  res.json({ ok: true, alerts: recentAlerts(Number.isFinite(limit) ? limit : 50) });
});

router.post('/', rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  if (!isAlertBody(req.body)) {
    res.status(400).json({ ok: false, error: 'invalid alert payload' });
    return;
  }
  const b = req.body;
  const alert: StandardAlert = {
    id: `alert:${Date.now()}`,
    alertType: b.alertType as string,
    severity: b.severity as StandardAlert['severity'],
    engineId: b.engineId as string,
    parameter: typeof b.parameter === 'string' ? b.parameter : undefined,
    value: typeof b.value === 'number' ? b.value : undefined,
    threshold: typeof b.threshold === 'number' ? b.threshold : undefined,
    scenario: typeof b.scenario === 'string' ? b.scenario : 'unknown',
    timestamp: typeof b.timestamp === 'string' ? b.timestamp : new Date().toISOString(),
  };

  const result = await runAlertPipeline(alert);
  res.json({
    ok: true,
    alert: result.alert,
    duplicate: result.duplicate,
    sms: result.sms,
  });
});

export default router;
