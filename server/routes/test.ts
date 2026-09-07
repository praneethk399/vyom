import { Router } from 'express';
import { engineSim } from '../lib/engineSim';
import { runAlertPipeline } from '../lib/alertPipeline';
import { rateLimit } from '../lib/rateLimit';
import type { StandardAlert } from '../lib/alertEngine';

/**
 * DEVELOPMENT / TEST ONLY — POST /api/test/critical-alert
 *
 * Forces a VIBRATION_LIMIT_BREACH CRITICAL alert through the complete
 * pipeline (alert engine -> history -> SMS service) regardless of the current
 * scenario, so the whole chain can be exercised on demand.
 */
const router = Router();

router.post('/', rateLimit({ windowMs: 60_000, max: 10 }), async (_req, res) => {
  const snap = engineSim.snapshot();
  const alert: StandardAlert = {
    id: `alert:${Date.now()}`,
    alertType: 'VIBRATION_LIMIT_BREACH',
    severity: 'CRITICAL',
    engineId: snap.engineId,
    parameter: 'vibration',
    value: snap.vibration,
    threshold: 2.5,
    scenario: 'vibration_growth',
    timestamp: new Date().toISOString(),
  };

  const result = await runAlertPipeline(alert);
  res.json({
    ok: true,
    dev: true,
    note: 'development/test endpoint — test VIBRATION_LIMIT_BREACH alert sent through the full pipeline',
    alert: result.alert,
    duplicate: result.duplicate,
    sms: result.sms,
  });
});

export default router;
