export const ENGINE_ID = 'GAS418S';

export type ScenarioName =
  | 'nominal'
  | 'tet_runaway'
  | 'vibration_growth'
  | 'oil_pressure_loss'
  | 'compressor_surge'
  | 'fuel_flow_anomaly'
  | 'battery_sag';

export const SCENARIOS: ScenarioName[] = [
  'nominal',
  'tet_runaway',
  'vibration_growth',
  'oil_pressure_loss',
  'compressor_surge',
  'fuel_flow_anomaly',
  'battery_sag',
];

export function isScenarioName(v: unknown): v is ScenarioName {
  return typeof v === 'string' && (SCENARIOS as string[]).includes(v);
}

/** GET /api/telemetry — the current simulated engine state. */
export interface EngineSnapshot {
  engineId: string;
  rpm: number;
  tet: number;
  thrust: number;
  oilPressure: number;
  vibration: number;
  fuelFlow: number;
  batteryVoltage: number;
  health: number;
  predictedRUL: number;
  missionStatus: string;
  scenario: ScenarioName;
  timestamp: string;
}