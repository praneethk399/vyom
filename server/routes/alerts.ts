import { Router } from 'express';
import { processAlert } from '../services/alertEngine';
import { recentAlerts } from '../services/alertStore';
import { telemetryService } from '../services/telemetryService';
import { validateAlertBody } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { rateLimit } from '../middleware/validation';
import { ENGINE_ID } from '../models/telemetry';
import type { StandardAlert } from '../models/alert';

/**
 * Alert API:
 *   POST /api/alerts            — ingest a standardized alert (validate, record,
 *                                 SMS for WARNING/CRITICAL, 5-min dedup)
 *   GET  /api/alerts            — recent alert history for the dashboard
 *   POST /api/test/critical-alert — DEVELOPMENT ONLY: force a VIBRATION_LIMIT_BREACH
 *                                 CRITICAL alert through the whole pipeline
 */

const alertsRouter = Router();

alertsRouter.get('/', (_req, res) => {
  const raw = Number((_req.query.limit as string | undefined) ?? 50);
  const limit = Number.isFinite(raw) && raw > 0 ? raw : 50;
  res.json({ ok: true, alerts: recentAlerts(limit) });
});

alertsRouter.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 30 }),
  asyncHandler(async (req, res) => {
    const alert = validateAlertBody(req.body);
    if (!alert) {
      res.status(400).json({ ok: false, error: 'invalid alert payload' });
      return;
    }
    const result = await processAlert(alert);
    res.json({ ok: true, alert: result.alert, duplicate: result.duplicate, sms: result.sms });
  }),
);

/** DEVELOPMENT / TEST ONLY — exercises the complete alert → storage → SMS chain. */
const testRouter = Router();

testRouter.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 10 }),
  asyncHandler(async (_req, res) => {
    const snap = telemetryService.snapshot();
    const alert: StandardAlert = {
      id: `alert:${Date.now()}`,
      alertType: 'VIBRATION_LIMIT_BREACH',
      severity: 'CRITICAL',
      engineId: ENGINE_ID,
      parameter: 'vibration',
      value: snap.vibration,
      threshold: 2.5,
      scenario: 'vibration_growth',
      timestamp: new Date().toISOString(),
    };
    const result = await processAlert(alert);
    res.json({
      ok: true,
      dev: true,
      note: 'development/test endpoint — test VIBRATION_LIMIT_BREACH alert sent through the full pipeline',
      alert: result.alert,
      duplicate: result.duplicate,
      sms: result.sms,
    });
  }),
);

export default alertsRouter;
export { testRouter };