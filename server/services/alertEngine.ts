import { telemetryService } from './telemetryService';
import { ENGINE_ID, type ScenarioName } from '../models/telemetry';
import type { ScenarioAlertType, StandardAlert } from '../models/alert';
import { markSmsSent, recordAlert, smsDuplicate } from './alertStore';
import { sendAlertSMS } from './smsService';

/**
 * Centralized alert engine — the single place that decides engine-health
 * alerts. A scenario (or an external alert POST) is evaluated here against
 * configurable thresholds, recorded, and — for WARNING/CRITICAL only, and
 * only if not already SMS'd for this engine + alertType in the last 5 minutes
 * — sent via the SMS service. NORMAL is recorded but never SMS'd.
 */

interface ScenarioRule {
  alertType: ScenarioAlertType;
  severity: StandardAlert['severity'];
  parameter?: string;
  value?: number;
  threshold?: number;
}

export const SCENARIO_RULES: Record<ScenarioName, ScenarioRule> = {
  nominal: { alertType: 'SYSTEM_NOMINAL', severity: 'NORMAL' },
  tet_runaway: { alertType: 'TET_RUNAWAY', severity: 'CRITICAL', parameter: 'tet', threshold: 1250 },
  vibration_growth: { alertType: 'VIBRATION_LIMIT_BREACH', severity: 'CRITICAL', parameter: 'vibration', threshold: 2.5 },
  oil_pressure_loss: { alertType: 'OIL_PRESSURE_LOSS', severity: 'CRITICAL', parameter: 'oilPressure', threshold: 38 },
  compressor_surge: { alertType: 'COMPRESSOR_SURGE', severity: 'CRITICAL', parameter: 'pressureRatio', threshold: 8.5 },
  fuel_flow_anomaly: { alertType: 'FUEL_FLOW_ANOMALY', severity: 'WARNING', parameter: 'fuelFlow', threshold: 45 },
  battery_sag: { alertType: 'BATTERY_SAG', severity: 'WARNING', parameter: 'batteryVoltage', threshold: 23 },
};

let alertSeq = 0;

function pickValue(scenario: ScenarioName, snap: ReturnType<typeof telemetryService.snapshot>): number | undefined {
  switch (scenario) {
    case 'tet_runaway':
      return snap.tet;
    case 'vibration_growth':
      return snap.vibration;
    case 'oil_pressure_loss':
      return snap.oilPressure;
    case 'fuel_flow_anomaly':
      return snap.fuelFlow;
    case 'battery_sag':
      return snap.batteryVoltage;
    default:
      return undefined;
  }
}

/** Map a scenario to the standardized alert, sampling the live telemetry. */
export function evaluateScenario(scenario: ScenarioName): StandardAlert {
  const rule = SCENARIO_RULES[scenario];
  const snap = telemetryService.snapshot();
  return {
    id: `alert:${Date.now()}:${alertSeq++}`,
    alertType: rule.alertType,
    severity: rule.severity,
    engineId: ENGINE_ID,
    parameter: rule.parameter,
    value: rule.parameter ? pickValue(scenario, snap) : undefined,
    threshold: rule.parameter ? rule.threshold : undefined,
    scenario,
    timestamp: new Date().toISOString(),
  };
}

export interface AlertPipelineResult {
  alert: StandardAlert;
  duplicate: boolean;
  sms: StandardAlert['sms'];
}

/** Record the alert, then (WARNING/CRITICAL, not duplicated) send SMS. Never throws. */
export async function processAlert(alert: StandardAlert): Promise<AlertPipelineResult> {
  let sms: StandardAlert['sms'] = 'not-required';
  let duplicate = false;

  if (alert.severity !== 'NORMAL') {
    if (smsDuplicate(alert.alertType, alert.engineId)) {
      duplicate = true; // already SMS'd within the 5-minute window
    } else {
      const outcome = await sendAlertSMS(alert);
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