import { ENGINE_ID, type EngineSnapshot, type ScenarioName } from '../models/telemetry';

/**
 * Central telemetry service — owns the simulated GAS418S engine state.
 * Scenario changes (from the simulation service) mutate this state; GET
 * /api/telemetry reports it. Baselines mirror the DRDO Mission 01 cruise.
 */

interface ScenarioState {
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
}

const BASELINE: ScenarioState = {
  rpm: 11950,
  tet: 1080.5,
  thrust: 51.5,
  oilPressure: 70.5,
  vibration: 0.8,
  fuelFlow: 31.5,
  batteryVoltage: 28.2,
  health: 66.5,
  predictedRUL: 1250,
  missionStatus: 'NOMINAL',
};

const SCENARIO_STATE: Record<ScenarioName, Partial<ScenarioState>> = {
  nominal: {},
  tet_runaway: { tet: 1275, health: 52, predictedRUL: 1150, missionStatus: 'ENV_RESTRICT' },
  vibration_growth: { vibration: 2.87, health: 54, predictedRUL: 1180, missionStatus: 'ENV_RESTRICT' },
  oil_pressure_loss: { oilPressure: 34, health: 50, predictedRUL: 1100, missionStatus: 'ENV_RESTRICT' },
  compressor_surge: { vibration: 1.9, thrust: 40.2, health: 49, predictedRUL: 1080, missionStatus: 'ENV_RESTRICT' },
  fuel_flow_anomaly: { fuelFlow: 46.2, health: 61, predictedRUL: 1220, missionStatus: 'ENV_RESTRICT' },
  battery_sag: { batteryVoltage: 22.4, health: 63, predictedRUL: 1240, missionStatus: 'ENV_RESTRICT' },
};

export class TelemetryService {
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
      batteryVoltage: s.batteryVoltage ?? BASELINE.batteryVoltage,
      health: s.health ?? BASELINE.health,
      predictedRUL: s.predictedRUL ?? BASELINE.predictedRUL,
      missionStatus: s.missionStatus ?? BASELINE.missionStatus,
      scenario: this.scenario,
      timestamp: new Date().toISOString(),
    };
  }
}

export const telemetryService = new TelemetryService();