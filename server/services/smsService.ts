import type { StandardAlert } from '../models/alert';

/**
 * SMS service — Fast2SMS. Credentials come from server env only:
 *   FAST2SMS_API_KEY, ALERT_PHONE_NUMBER
 * Never exposed to the frontend (no VITE_ prefix).
 *
 * Failure handling is deliberate: a missing key, malformed phone number or
 * provider error never throws — it returns { sent:false } so the pipeline can
 * respond with sms:'failed' and telemetry/simulation keep running. With no
 * API key the service logs the exact message (dev-test mode) and reports
 * success so the whole chain is exercisable without a provider.
 */

export type SmsOutcome = { sent: boolean; mode: 'fast2sms' | 'dev-test' };

function num(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function validPhone(p: string): boolean {
  return /^\+?[0-9]{7,15}$/.test(p);
}

/** Fault-specific SMS copy, per the alert spec. */
export function formatSmsMessage(a: StandardAlert): string {
  const id = a.engineId;
  switch (a.alertType) {
    case 'TET_RUNAWAY':
      return `VYOM CRITICAL ALERT: ${id} TET runaway detected. Temperature exceeded safe operating threshold. Immediate inspection required.`;
    case 'VIBRATION_LIMIT_BREACH':
      return `VYOM CRITICAL ALERT: ${id} vibration limit breached. Current vibration: ${fmt(a.value)} RMS. Threshold: ${fmt(a.threshold)} RMS. Immediate inspection required.`;
    case 'OIL_PRESSURE_LOSS':
      return `VYOM CRITICAL ALERT: ${id} oil pressure loss detected. Immediate engine inspection required.`;
    case 'COMPRESSOR_SURGE':
      return `VYOM CRITICAL ALERT: ${id} compressor surge detected. Engine operation unstable. Immediate intervention required.`;
    case 'FUEL_FLOW_ANOMALY':
      return `VYOM WARNING: ${id} abnormal fuel-flow detected. Inspection recommended.`;
    case 'BATTERY_SAG':
      return `VYOM WARNING: ${id} battery sag detected. Check engine power system.`;
    default:
      return `VYOM ${a.severity}: ${id} ${a.alertType.replace(/_/g, ' ')}.`;
  }
}

function fmt(v: number | undefined): string {
  if (v === undefined) return '?';
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

async function sendFast2Sms(a: StandardAlert): Promise<SmsOutcome> {
  const key = num(process.env.FAST2SMS_API_KEY);
  const phone = num(process.env.ALERT_PHONE_NUMBER);
  const message = formatSmsMessage(a);

  if (!key) {
    console.log(`[sms:dev-test] ${message}`);
    return { sent: true, mode: 'dev-test' };
  }
  if (!phone || !validPhone(phone)) {
    console.error('[sms] invalid ALERT_PHONE_NUMBER — SMS not sent');
    return { sent: false, mode: 'fast2sms' };
  }

  const url = new URL('https://www.fast2sms.com/dev/bulkV2');
  url.searchParams.set('authorization', key);
  url.searchParams.set('message', message);
  url.searchParams.set('language', 'english');
  url.searchParams.set('route', 'q');
  url.searchParams.set('numbers', phone);

  try {
    const res = await fetch(url.toString());
    const json = (await res.json().catch(() => null)) as { return?: boolean | number } | null;
    const ok = res.ok && (json?.return === true || json?.return === undefined);
    if (!ok) console.error(`[sms] Fast2SMS rejected alert ${a.alertType}`);
    return { sent: ok, mode: 'fast2sms' };
  } catch (err) {
    console.error(`[sms] provider error for ${a.alertType}:`, err instanceof Error ? err.message : err);
    return { sent: false, mode: 'fast2sms' };
  }
}

/**
 * Central SMS entry point. NORMAL is refused here as a final guard on top of
 * the callers; only WARNING and CRITICAL should ever reach the provider.
 */
export async function sendAlertSMS(a: StandardAlert): Promise<SmsOutcome> {
  if (a.severity === 'NORMAL') return { sent: false, mode: 'dev-test' };
  return sendFast2Sms(a);
}