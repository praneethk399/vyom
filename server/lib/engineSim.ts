/**
 * Server-side GAS418S simulated engine state for the scenario/simulation and
 * telemetry APIs. One authoritative snapshot (engineId + cruise parameters +
 * health/RUL/mission status) that POST /api/simulation/scenario mutates and
 * GET /api/telemetry reports.
 *
 * The browser's continuous LIVE_SIM generator is untouched — this mirrors the
 * scenario layer server-side so alerts/SMS are centralized here.
 */

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

export interface EngineSnapshot {
  engineId: string;
  rpm: number;
  tet: number;
  thrust: number;
  oilPressure: number;
  vibration: number;
  fuelFlow: number;
  battery: number;
  health: number;
  predictedRUL: number;
  missionStatus: string;
  scenario: ScenarioName;
  timestamp: string;
}

// Baseline: 70% PLA surveillance cruise (mirrors NOMINAL envelope).
interface ScenarioState {
  rpm: number;
  tet: number;
  thrust: number;
  oilPressure: number;
  vibration: number;
  fuelFlow: number;
  battery: number;
  health: number;
  predictedRUL: number;
  missionStatus: string;
}

const BASELINE: ScenarioState = {
  rpm: 11950,
  tet: 1080.5,
  thrust: 51.5,
  oilPressure: 70.5,
  vibration: 0.8,
  fuelFlow: 31.5,
  battery: 28.2,
  health: 66.5,
  predictedRUL: 1250,
  missionStatus: 'NOMINAL',
};

const SCENARIO_STATE: Record<ScenarioName, Partial<ScenarioState>> = {
  nominal: {},
  tet_runaway: { tet: 1275, health: 52, predictedRUL: 1150, missionStatus: 'ENV RESTRICT' },
  vibration_growth: { vibration: 2.87, health: 54, predictedRUL: 1180, missionStatus: 'ENV RESTRICT' },
  oil_pressure_loss: { oilPressure: 34, health: 50, predictedRUL: 1100, missionStatus: 'ENV RESTRICT' },
  compressor_surge: { vibration: 1.9, thrust: 40.2, health: 49, predictedRUL: 1080, missionStatus: 'ENV RESTRICT' },
  fuel_flow_anomaly: { fuelFlow: 46.2, health: 61, predictedRUL: 1220, missionStatus: 'ENV RESTRICT' },
  battery_sag: { battery: 22.4, health: 63, predictedRUL: 1240, missionStatus: 'ENV RESTRICT' },
};

export class EngineSim {
  private scenario: ScenarioName = 'nominal';

  applyScenario(name: ScenarioName): EngineSnapshot {
    this.scenario = name;
    return this.snapshot();
  }

  snapshot(): EngineSnapshot {
    const s = SCENARIO_STATE[this.scenario];
    return {
      engineId: ENGINE_ID,
      rpm: s.rpm ?? BASELINE.rpm,
      tet: s.tet ?? BASELINE.tet,
      thrust: s.thrust ?? BASELINE.thrust,
      oilPressure: s.oilPressure ?? BASELINE.oilPressure,
      vibration: s.vibration ?? BASELINE.vibration,
      fuelFlow: s.fuelFlow ?? BASELINE.fuelFlow,
      battery: s.battery ?? BASELINE.battery,
      health: s.health ?? BASELINE.health,
      predictedRUL: s.predictedRUL ?? BASELINE.predictedRUL,
      missionStatus: s.missionStatus ?? BASELINE.missionStatus,
      scenario: this.scenario,
      timestamp: new Date().toISOString(),
    };
  }
}

export const engineSim = new EngineSim();
