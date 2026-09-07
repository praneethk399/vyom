import { useAlertStore } from '../../state/alertStore';
import { useTelemetryStore } from '../../state/telemetryStore';
import { RULE_BY_PARAM } from '../../lib/thresholds';
import type { EngineTelemetry, FaultClass, SmsStatus } from '../../lib/types';

/**
 * Scenario → alert pipeline for the Scenario Sim fault-injection panel.
 *
 * Every button press builds one standardized alert object, pushes it into the
 * existing alert store (feed entry + toast/vignette delivery) and — for
 * WARNING and CRITICAL only — sends it to the backend /api/alerts route for
 * SMS. The SMS key lives server-side; this module never touches it.
 */

export const ENGINE_ID = 'GAS418S';

/** Severity / alertType mapping — the exact table from the alert spec. */
export const SCENARIO_ALERTS: Record<
  FaultClass,
  { severity: 'NORMAL' | 'WARNING' | 'CRITICAL'; alertType: string; parameter?: string }
> = {
  NORMAL: { severity: 'NORMAL', alertType: 'SYSTEM_NOMINAL' },
  TET_RUNWAY: { severity: 'CRITICAL', alertType: 'TET_RUNAWAY', parameter: 'TET' },
  VIBRATION_GROWTH: { severity: 'CRITICAL', alertType: 'VIBRATION_LIMIT_BREACH', parameter: 'VIBRATION' },
  OIL_PRESSURE_LOSS: { severity: 'CRITICAL', alertType: 'OIL_PRESSURE_LOSS', parameter: 'OIL_PRESSURE' },
  COMPRESSOR_STALL: { severity: 'CRITICAL', alertType: 'COMPRESSOR_SURGE', parameter: 'COMPRESSOR' },
  FUEL_FLOW_ANOMALY: { severity: 'WARNING', alertType: 'FUEL_FLOW_ANOMALY', parameter: 'FUEL_FLOW' },
  BATTERY_SAG: { severity: 'WARNING', alertType: 'BATTERY_SAG', parameter: 'BATTERY' },
};

/** Standardized alert object sent across the whole pipeline. */
export interface ScenarioAlert {
  id?: string;
  alertType: string;
  severity: 'NORMAL' | 'WARNING' | 'CRITICAL';
  engineId: string;
  parameter?: string;
  value?: number;
  threshold?: number;
  timestamp: string;
  scenario: FaultClass;
}

/** Alert parameter → telemetry field + deterministic limit rule. */
const PARAM_RULE: Record<string, { field: keyof EngineTelemetry; rule: string }> = {
  TET: { field: 'tet', rule: 'tet' },
  VIBRATION: { field: 'vibration', rule: 'vibration' },
  OIL_PRESSURE: { field: 'oilPressure', rule: 'oilPressure' },
  COMPRESSOR: { field: 'pressureRatio', rule: 'pressureRatio' },
  FUEL_FLOW: { field: 'fuelFlow', rule: 'fuelFlow' },
  BATTERY: { field: 'batteryVoltage', rule: 'batteryVoltage' },
};

let scenarioSeq = 0;

/**
 * Build the standardized alert for a scenario, sampling the live frame value
 * and the deterministic hard limit as value/threshold metadata.
 */
export function buildScenarioAlert(scenario: FaultClass): ScenarioAlert {
  const spec = SCENARIO_ALERTS[scenario];
  const frame = useTelemetryStore.getState().frame;
  let value: number | undefined;
  let threshold: number | undefined;
  if (spec.parameter && frame) {
    const map = PARAM_RULE[spec.parameter];
    value = map ? (frame[map.field] as unknown as number) : undefined;
    threshold = map ? RULE_BY_PARAM.get(map.rule)?.hardLimit : undefined;
  }
  return {
    id: `scen:${Date.now()}:${scenarioSeq++}`,
    alertType: spec.alertType,
    severity: spec.severity,
    engineId: ENGINE_ID,
    parameter: spec.parameter,
    value,
    threshold,
    timestamp: new Date().toISOString(),
    scenario,
  };
}

const STORE_SEVERITY: Record<ScenarioAlert['severity'], 'nominal' | 'warning' | 'critical'> = {
  NORMAL: 'nominal',
  WARNING: 'warning',
  CRITICAL: 'critical',
};

/**
 * Push a scenario alert into the existing alert pipeline (feed entry +
 * severity delivery: toast / pulse / vignette + shake). Uses the object's id.
 */
export function addAlert(alert: ScenarioAlert): void {
  useAlertStore.getState().pushAlert({
    id: alert.id,
    severity: STORE_SEVERITY[alert.severity],
    category: alert.severity === 'NORMAL' ? 'SYSTEM_ADVISORY' : 'ACTIVE_LIMIT',
    title: alert.alertType.replace(/_/g, ' '),
    message: describe(alert),
    parameter: alert.parameter,
    source: 'system',
  });
}

function describe(a: ScenarioAlert): string {
  if (a.severity === 'NORMAL') return 'FAULT CONDITIONS CLEARED — ALL SYSTEMS NOMINAL';
  const parts: string[] = [];
  if (a.parameter) {
    if (a.value !== undefined) parts.push(`${a.parameter} ${fmt(a.value)}`);
    if (a.threshold !== undefined) parts.push(`hard limit ${fmt(a.threshold)}`);
  }
  parts.push(`${a.scenario.replace(/_/g, ' ')} injected`);
  return parts.join(' — ');
}

function fmt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 100) return v.toFixed(1);
  return v.toFixed(2);
}

// ---------------------------------------------------------------------------
// SMS — one reusable sender. Only WARNING / CRITICAL reach the service; the
// same alertType + engine is suppressed for 5 minutes. The backend enforces
// the same window, so repeated clicks can never flood the SMS provider.
// ---------------------------------------------------------------------------

const SMS_TTL_MS = 5 * 60 * 1000;
const smsLastSent = new Map<string, number>();

export type SmsOutcome = SmsStatus;

/**
 * POST the alert to /api/alerts for SMS and tag the matching feed entry so
 * the Alert Feed can show its delivery status.
 */
export async function sendAlertSMS(alert: ScenarioAlert): Promise<SmsOutcome> {
  if (alert.severity !== 'WARNING' && alert.severity !== 'CRITICAL') {
    return tag(alert, 'not-required'); // NORMAL never reaches the SMS service
  }
  const key = `${alert.alertType}:${alert.engineId}`;
  const now = Date.now();
  if (now - (smsLastSent.get(key) ?? 0) < SMS_TTL_MS) {
    return tag(alert, 'not-required'); // 5-minute duplicate suppression
  }

  try {
    const res = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
    });
    const body = (await res.json().catch(() => ({}))) as { duplicate?: boolean };
    if (!res.ok) return tag(alert, 'failed');
    if (body.duplicate) return tag(alert, 'not-required');
    smsLastSent.set(key, now);
    return tag(alert, 'sent');
  } catch {
    return tag(alert, 'failed');
  }
}

function tag(alert: ScenarioAlert, sms: SmsStatus): SmsStatus {
  if (alert.id) useAlertStore.getState().setSmsStatus(alert.id, sms);
  return sms;
}
