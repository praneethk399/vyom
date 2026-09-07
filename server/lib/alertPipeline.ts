import type { StandardAlert } from './alertEngine';
import { markSmsSent, recordAlert, smsDuplicate } from './alertStore';
import { sendAlertSms } from './sms';

export interface PipelineResult {
  alert: StandardAlert;
  duplicate: boolean;
  sms: 'sent' | 'failed' | 'not-required';
}

/**
 * One pipeline for every alert entry point (scenario simulation, direct
 * POST /api/alerts, dev test endpoint): record the alert, then — only for
 * WARNING / CRITICAL and only when not already SMS'd for this engine + type
 * within 5 minutes — send SMS. NORMAL is recorded but never reaches the SMS
 * service. Never throws: SMS failure surfaces as sms:'failed'.
 */
export async function runAlertPipeline(alert: StandardAlert): Promise<PipelineResult> {
  let sms: PipelineResult['sms'] = 'not-required';
  let duplicate = false;

  if (alert.severity !== 'NORMAL') {
    if (smsDuplicate(alert.alertType, alert.engineId)) {
      duplicate = true; // already SMS'd in the 5-minute window
    } else {
      const outcome = await sendAlertSms(alert);
      if (outcome.sent) {
        markSmsSent(alert.alertType, alert.engineId);
        sms = 'sent';
      } else {
        sms = 'failed';
      }
    }
  }

  alert.sms = sms;
  recordAlert(alert);
  return { alert, duplicate, sms };
}
