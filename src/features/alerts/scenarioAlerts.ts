import { useAlertStore } from '../../state/alertStore';
import { useTelemetryStore } from '../../state/telemetryStore';
import { systemEvent } from '../telemetry/useTelemetryEngine';
import type { EngineTelemetry, FaultClass, SmsStatus } from '../../lib/types';

/**
 * Scenario Sim → backend pipeline. The Scenario Sim buttons now POST to the
 * server's simulation endpoint; the backend applies the scenario to its own
 * simulated engine, runs the centralized alert engine (dedup + SMS + history)
 * and returns the authoritative telemetry snapshot + alert. This module only
 * adapts that result into the existing client stores — no alert classification
 * or SMS logic is duplicated in React.
 */

/** Existing fault classes → backend scenario vocabulary. */
const SCENARIO: Record<FaultClass, string> = {
  NORMAL: 'nominal',
  TET_RUNWAY: 'tet_runaway',
  VIBRATION_GROWTH: 'vibration_growth',
  OIL_PRESSURE_LOSS: 'oil_pressure_loss',
  COMPRESSOR_STALL: 'compressor_surge',
  FUEL_FLOW_ANOMALY: 'fuel_flow_anomaly',
  BATTERY_SAG: 'battery_sag',
};

interface ServerAlert {
  id: string;
  alertType: string;
  severity: 'NORMAL' | 'WARNING' | 'CRITICAL';
  engineId: string;
  parameter?: string;
  value?: number;
  threshold?: number;
  timestamp: string;
  scenario: string;
  sms?: SmsStatus;
}

interface ServerSnapshot {
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
  scenario: string;
  timestamp: string;
}

interface SimulationResponse {
  ok: boolean;
  telemetry: ServerSnapshot;
  alert: ServerAlert;
  duplicate: boolean;
  sms: SmsStatus;
}

function fallbackFrame(): EngineTelemetry {
  return {
    throttle: 70,
    altitude: 5000,
    thrust: 51.5,
    n2Rpm: 11950,
    tet: 1080.5,
    pressureRatio: 15.4,
    bladeStress: 590,
    efficiency: 41,
    batteryVoltage: 28.2,
    oilPressure: 70.5,
    vibration: 0.8,
    fuelFlow: 31.5,
    healthIndex: 66.5,
    rulHours: 1250,
    entropyPoints: { s: [1, 1.236, 2.765, 3.025], t: [256, 550, 1081, 603] },
  };
}

/** Merge the server snapshot into the current frame (keeps client motion). */
function adoptSnapshot(s: ServerSnapshot): void {
  const current = useTelemetryStore.getState().frame ?? fallbackFrame();
  const frame: EngineTelemetry = {
    ...current,
    n2Rpm: s.rpm,
    tet: s.tet,
    thrust: s.thrust,
    oilPressure: s.oilPressure,
    vibration: s.vibration,
    fuelFlow: s.fuelFlow,
    batteryVoltage: s.batteryVoltage,
    healthIndex: s.health,
    rulHours: s.predictedRUL,
  };
  useTelemetryStore.setState({ frame, frameTs: Date.now() });
}

const STORE_SEVERITY: Record<ServerAlert['severity'], 'nominal' | 'warning' | 'critical'> = {
  NORMAL: 'nominal',
  WARNING: 'warning',
  CRITICAL: 'critical',
};

function describeAlert(a: ServerAlert): string {
  if (a.severity === 'NORMAL') return 'FAULT CONDITIONS CLEARED — ALL SYSTEMS NOMINAL';
  const parts: string[] = [];
  if (a.value !== undefined) parts.push(String(a.value));
  if (a.threshold !== undefined) parts.push(`hard limit ${a.threshold}`);
  parts.push(a.scenario.replace(/_/g, ' ') + ' injected');
  return parts.join(' — ');
}

/** Push the backend-evaluated alert through the existing delivery pipeline. */
function pushServerAlert(a: ServerAlert): void {
  useAlertStore.getState().pushAlert({
    id: a.id,
    severity: STORE_SEVERITY[a.severity],
    category: a.severity === 'NORMAL' ? 'SYSTEM_ADVISORY' : 'ACTIVE_LIMIT',
    title: a.alertType.replace(/_/g, ' '),
    message: describeAlert(a),
    parameter: a.parameter,
    source: 'system',
    sms: a.sms,
  });
}

/**
 * Drive one Scenario Sim selection through the backend:
 * Scenario Sim → POST /api/simulation/scenario → backend simulation → alert
 * engine → SMS → telemetry + alert adopted into the existing stores.
 * Returns null when the backend is unreachable (the client fault state is
 * still applied locally so LIVE_SIM keeps running).
 */
export async function runScenario(fault: FaultClass): Promise<SimulationResponse | null> {
  try {
    const res = await fetch('/api/simulation/scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: SCENARIO[fault] }),
    });
    const body = (await res.json().catch(() => null)) as SimulationResponse | null;
    if (!res.ok || !body?.ok || !body.telemetry || !body.alert) throw new Error('bad simulation response');
    adoptSnapshot(body.telemetry);
    pushServerAlert(body.alert);
    return body;
  } catch {
    systemEvent('LINK', 'SIMULATION API UNREACHABLE — LOCAL FAULT MODE', 'caution');
    return null;
  }
}
