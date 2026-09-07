export type AlertSeverity = 'NORMAL' | 'WARNING' | 'CRITICAL';

export type SmsStatus = 'sent' | 'failed' | 'not-required';

export type ScenarioAlertType =
  | 'SYSTEM_NOMINAL'
  | 'TET_RUNAWAY'
  | 'VIBRATION_LIMIT_BREACH'
  | 'OIL_PRESSURE_LOSS'
  | 'COMPRESSOR_SURGE'
  | 'FUEL_FLOW_ANOMALY'
  | 'BATTERY_SAG';

/** Standardized alert shape used by the API, alert engine, storage and SMS. */
export interface StandardAlert {
  id: string;
  alertType: string; // ScenarioAlertType for engine scenarios; callers may send others
  severity: AlertSeverity;
  engineId: string;
  parameter?: string;
  value?: number;
  threshold?: number;
  scenario: string;
  timestamp: string;
  sms?: SmsStatus;
}