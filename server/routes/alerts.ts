import { Router } from 'express';
import { sendAlertSms } from '../lib/sms';

/**
 * Alert -> SMS endpoint. The client POSTs the standardized scenario alert;
 * only WARNING / CRITICAL reach the SMS service, and the same alertType +
 * engineId is suppressed for 5 minutes server-side (belt over the client's
 * braces) so repeated scenario clicks can never flood the provider.
 */

const SMS_TTL_MS = 5 * 60 * 1000;
const lastSent = new Map<string, number>();

interface AlertBody {
  alertType: string;
  severity: 'NORMAL' | 'WARNING' | 'CRITICAL';
  engineId: string;
  scenario: string;
  parameter?: string;
  value?: number;
  threshold?: number;
  timestamp?: string;
}

function isAlertBody(b: unknown): b is AlertBody {
  if (typeof b !== 'object' || b === null) return false;
  const a = b as Record<string, unknown>;
  return (
    typeof a.alertType === 'string' &&
    (a.severity === 'WARNING' || a.severity === 'CRITICAL' || a.severity === 'NORMAL') &&
    typeof a.engineId === 'string' &&
    typeof a.scenario === 'string'
  );
}

const router = Router();

router.post('/', async (req, res) => {
  if (!isAlertBody(req.body)) {
    res.status(400).json({ ok: false, error: 'invalid alert payload' });
    return;
  }
  const alert = req.body;

  // NORMAL / SYSTEM_NOMINAL never triggers SMS.
  if (alert.severity === 'NORMAL') {
    res.json({ ok: true, sms: 'not-required' });
    return;
  }

  const key = `${alert.alertType}:${alert.engineId}`;
  const now = Date.now();
  const last = lastSent.get(key) ?? 0;
  if (now - last < SMS_TTL_MS) {
    res.json({ ok: true, duplicate: true, sms: 'not-required' });
    return;
  }

  const result = await sendAlertSms(alert);
  if (result.sent) lastSent.set(key, now);
  res.json({
    ok: true,
    sms: result.sent ? 'sent' : 'failed',
    mode: result.mode,
  });
});

export default router;
