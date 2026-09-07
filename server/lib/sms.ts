/**
 * SMS delivery for the alert pipeline. Credentials are read from server env
 * only — never shipped to the client.
 *
 * Configured  -> real send via Twilio's REST API (no SDK dependency).
 * Not configured -> dev/test mode: the alert is logged server-side and the
 * route answers 200 so the full alert -> backend -> SMS pipeline can be
 * exercised end to end during development.
 */

interface SmsAlert {
  alertType: string;
  severity: 'NORMAL' | 'WARNING' | 'CRITICAL';
  engineId: string;
  parameter?: string;
  value?: number;
  threshold?: number;
  timestamp?: string;
  scenario: string;
}

export interface SmsResult {
  sent: boolean;
  mode: 'twilio' | 'dev-test';
}

function alertLine(a: SmsAlert): string {
  const v = a.value !== undefined ? ` (${a.value}${a.threshold !== undefined ? ` vs ${a.threshold}` : ''})` : '';
  const at = a.timestamp ? ` @ ${a.timestamp}` : '';
  return `[VYOM ${a.engineId}] ${a.severity} ${a.alertType}${a.parameter ? ` ${a.parameter}${v}` : ''} — ${a.scenario}${at}`;
}

/** Twilio SMS via its REST API (Basic auth, application/x-www-form-urlencoded). */
async function sendTwilio(a: SmsAlert): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const to = process.env.TWILIO_TO;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !to || !from) return false;

  const body = new URLSearchParams({ To: to, From: from, Body: alertLine(a) });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  return res.ok;
}

export async function sendAlertSms(a: SmsAlert): Promise<SmsResult> {
  const twilio = await sendTwilio(a).catch(() => false);
  if (twilio) return { sent: true, mode: 'twilio' };
  console.log(`[sms:dev-test] ${alertLine(a)}`);
  return { sent: true, mode: 'dev-test' };
}
