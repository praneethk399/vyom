/**
 * Centralized alert engine. A scenario (or direct alert POST) is evaluated
 * here against the deterministic limits, producing the standardized alert
 * shape used across the API, alert history and SMS service. The client does
 * not classify scenarios — it receives the result of this engine.
 */

import { ENGINE_ID, engineSim, type ScenarioName } from './engineSim';

export type AlertSeverity = 'NORMAL' | 'WARNING' | 'CRITICAL';

export type ScenarioAlertType =
  | 'SYSTEM_NOMINAL'
  | 'TET_RUNAWAY'
  | 'VIBRATION_LIMIT_BREACH'
  | 'OIL_PRESSURE_LOSS'
  | 'COMPRESSOR_SURGE'
  | 'FUEL_FLOW_ANOMALY'
  | 'BATTERY_SAG';

export interface StandardAlert {
  id: string;
  alertType: string; // ScenarioAlertType for engine scenarios; external callers may send others
  severity: AlertSeverity;
  engineId: string;
  parameter?: string;
  value?: number;
  threshold?: number;
  scenario: ScenarioName | string;
  timestamp: string;
  sms?: 'sent' | 'failed' | 'not-required';
}

interface ScenarioRule {
  alertType: ScenarioAlertType;
  severity: AlertSeverity;
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
  battery_sag: { alertType: 'BATTERY_SAG', severity: 'WARNING', parameter: 'battery', threshold: 23 },
};

let alertSeq = 0;

/** Map one of the six fault scenarios to the standardized alert object. */
export function evaluateScenario(scenario: ScenarioName): StandardAlert {
  const rule = SCENARIO_RULES[scenario];
  const snap = engineSim.snapshot();
  const value = pickValue(scenario, snap);
  return {
    id: `alert:${Date.now()}:${alertSeq++}`,
    alertType: rule.alertType,
    severity: rule.severity,
    engineId: ENGINE_ID,
    parameter: rule.parameter,
    value: rule.parameter ? (value ?? rule.value) : undefined,
    threshold: rule.parameter ? rule.threshold : undefined,
    scenario,
    timestamp: new Date().toISOString(),
  };
}

function pickValue(scenario: ScenarioName, snap: ReturnType<typeof engineSim.snapshot>): number | undefined {
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
      return snap.battery;
    default:
      return undefined;
  }
}
