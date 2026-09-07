/**
 * SMS delivery — Fast2SMS, credentials from server env only (never shipped to
 * the client): FAST2SMS_API_KEY + ALERT_PHONE_NUMBER.
 *
 * Failure handling is deliberate: a missing key, malformed phone number or
 * provider error never throws — it returns { sent:false } so the route can
 * respond 200 with sms:'failed' and the backend stays up. With no API key the
 * service runs in dev-test mode: the message is logged server-side and the
 * call reports success so the whole pipeline is exercisable without a key.
 */

import type { StandardAlert } from './alertEngine';

export type SmsOutcome = { sent: boolean; mode: 'fast2sms' | 'dev-test' };

function num(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Basic E.164-ish phone check — digits and leading + only, 7–15 digits. */
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

  // No key → dev-test mode: log the exact message that would be sent.
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
 * Central SMS entry point. Only WARNING and CRITICAL should reach it (the
 * callers enforce that); NORMAL is refused here as a final guard.
 */
export async function sendAlertSms(a: StandardAlert): Promise<SmsOutcome> {
  if (a.severity === 'NORMAL') return { sent: false, mode: 'dev-test' };
  return sendFast2Sms(a);
}
