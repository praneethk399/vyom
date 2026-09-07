import { clamp, NOMINAL } from '../../src/lib/nominal';
import { linSlope } from '../../src/lib/thresholds';
import type {
  AIDiagnosticReport,
  AssessmentBlock,
  EngineTelemetry,
  FailureStatus,
  FaultClass,
  ProbableFailureMode,
  RootCause,
  Subsystem,
} from '../../src/lib/types';

export interface DiagnoseInput {
  window: { ts: number; telemetry: EngineTelemetry }[];
  fault: FaultClass;
  mode: string;
  dataset: string | null;
}

/**
 * Envelope validation for POST /api/diagnose. Malformed bodies are a 400, not
 * a 500-in-process-crash: series() dereferences w.telemetry[key], so a bare
 * telemetry array used to throw a TypeError that Express 4 does not forward,
 * taking the whole API process down for every client.
 */
export function validateDiagnoseInput(
  body: unknown,
): { ok: true; input: DiagnoseInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be an object' };
  const b = body as Partial<DiagnoseInput>;
  if (!Array.isArray(b.window) || b.window.length === 0) return { ok: false, error: 'window required' };
  for (const [i, w] of b.window.entries()) {
    const ok = w !== null && typeof w === 'object' && typeof w.ts === 'number' && Number.isFinite(w.ts)
      && w.telemetry !== null && typeof w.telemetry === 'object';
    if (!ok) return { ok: false, error: `window[${i}] must be { ts: number, telemetry: object }` };
  }
  return {
    ok: true,
    input: {
      window: b.window as DiagnoseInput['window'],
      fault: b.fault ?? 'NORMAL',
      mode: b.mode ?? 'LIVE_SIM',
      dataset: b.dataset ?? null,
    },
  };
}

function series(input: DiagnoseInput, key: keyof EngineTelemetry): number[] {
  // Frames missing a field (malformed clients) fall back to the nominal
  // envelope value so the report reflects the sensor, not a silent zero.
  const n = (NOMINAL as unknown as Partial<Record<keyof EngineTelemetry, number>>)[key] ?? 0;
  return input.window.map((w) => {
    const v = w.telemetry[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : n;
  });
}

function stat(input: DiagnoseInput, key: keyof EngineTelemetry) {
  const v = series(input, key);
  const last = v[v.length - 1] ?? 0;
  const mean = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  const min = Math.min(...v);
  const max = Math.max(...v);
  const dt = input.window.length > 1 ? (input.window[input.window.length - 1].ts - input.window[0].ts) / 1000 : 0.1;
  const perMin = 60 / Math.max(dt, 0.01);
  const slopePerMin = linSlope(v.slice(-45)) * perMin;
  return { last, mean, min, max, slopePerMin };
}

function findFailure(
  failures: ProbableFailureMode[],
  subsystem: Subsystem,
): ProbableFailureMode | undefined {
  return failures.find((f) => f.subsystem === subsystem);
}

const MITIGATION: Record<Subsystem, string> = {
  Turbine: 'Reduce PLA, initiate engine cooldown, land at nearest divert field',
  Compressor: 'Reduce throttle transients, verify compressor inlet airflow, inspect bleed valves',
  'Bearings & Shaft': 'Monitor oil pressure, prepare for early landing, schedule bearing inspection',
  Electrical: 'Isolate non-essential DC loads, monitor bus regulation, land if sag persists',
  Combustor: 'Reduce PLA, schedule hot-section inspection, check fuel nozzles',
  'Fuel System': 'Verify fuel metering unit, check for leaks, reduce throttle excursions',
};

function statusFor(prob: number): FailureStatus {
  if (prob >= 0.9) return 'IMMINENT_BREACH';
  if (prob >= 0.5) return 'PRECURSOR_ACTIVE';
  return 'NOMINAL';
}

export function buildMockReport(input: DiagnoseInput): AIDiagnosticReport {
  const tet = stat(input, 'tet');
  const vibe = stat(input, 'vibration');
  const stress = stat(input, 'bladeStress');
  const oil = stat(input, 'oilPressure');
  const batt = stat(input, 'batteryVoltage');
  const fuel = stat(input, 'fuelFlow');
  const eff = stat(input, 'efficiency');
  const pr = stat(input, 'pressureRatio');
  const health = stat(input, 'healthIndex');
  const rul = stat(input, 'rulHours');

  // weighted penalty model -> healthScore (bands calibrated to the sample
  // dataset envelope: TET soft 1160 K, blade stress soft 700 MPa, oil soft 55
  // PSI, EPR soft 11, eff soft 34%, fuel soft 38 L/h)
  let penalty = 0;
  if (tet.last > 1160) penalty += (tet.last - 1160) / 6;
  if (vibe.last > 0.9) penalty += (vibe.last - 0.9) * 12;
  if (stress.last > 700) penalty += (stress.last - 700) / 3;
  if (oil.last < 55) penalty += (55 - oil.last) * 0.8;
  if (batt.last < 26) penalty += (26 - batt.last) * 2.2;
  if (eff.last < 34) penalty += (34 - eff.last) * 0.9;
  if (pr.last < 11) penalty += (11 - pr.last) * 3;
  if (fuel.last > 38) penalty += (fuel.last - 38) * 1.6;
  const healthScore = Math.round(clamp(health.last - penalty, 8, 100));

  const overallStatus =
    healthScore >= 90 ? 'OPTIMAL' : healthScore >= 78 ? 'ACCEPTABLE' : healthScore >= 55 ? 'DEGRADED' : 'CRITICAL';

  const failures: ProbableFailureMode[] = [];

  const pushFailure = (
    subsystem: Subsystem,
    failureMode: string,
    probability: number,
    precursorsDetected: string[],
    timeToFailureHours: number | null,
  ) => {
    failures.push({
      id: `mock:${subsystem}:${Math.round(probability * 100)}`,
      subsystem,
      failureMode,
      probability: clamp(probability, 0.03, 0.97),
      precursorsDetected,
      timeToFailureHours,
      mitigationAction: MITIGATION[subsystem],
      status: statusFor(probability),
    });
  };

  // fault-driven probable failures (the "predicts before the limit" signal)
  switch (input.fault) {
    case 'TET_RUNWAY':
      pushFailure('Turbine', 'Turbine inlet over-temperature', 0.78, ['TET rate of rise', 'Blade stress trend'], 6);
      pushFailure('Combustor', 'Combustor liner hot spot', 0.4, ['TET excursion'], 14);
      break;
    case 'VIBRATION_GROWTH':
      pushFailure('Bearings & Shaft', 'Rotor bearing wear', 0.82, ['Vibration amplitude', 'Shaft orbit growth'], 5);
      pushFailure('Turbine', 'Blade fatigue accumulation', 0.35, ['Blade stress trend'], 18);
      break;
    case 'OIL_PRESSURE_LOSS':
      pushFailure('Bearings & Shaft', 'Oil starvation — bearing wipe risk', 0.8, ['Oil pressure decay', 'Vibration coupling'], 3);
      break;
    case 'COMPRESSOR_STALL':
      pushFailure('Compressor', 'Compressor surge / stall — boost margin loss', 0.85, ['EPR drop', 'Efficiency loss', 'Vibration spikes'], 4);
      break;
    case 'FUEL_FLOW_ANOMALY':
      pushFailure('Fuel System', 'Fuel metering anomaly', 0.8, ['Fuel flow excess', 'TET coupling'], 7);
      pushFailure('Combustor', 'Fuel nozzle coking', 0.38, ['Fuel flow trend'], 16);
      break;
    case 'BATTERY_SAG':
      pushFailure('Electrical', 'DC bus voltage sag — starter/generator degradation', 0.84, ['Battery voltage decay'], 9);
      break;
    default:
      break;
  }

  // threshold-driven probable failures on top of any injected fault
  if (tet.last > 1170 && !findFailure(failures, 'Turbine')) {
    pushFailure('Turbine', 'TET exceedance', clamp(0.45 + (tet.last - 1170) / 250, 0.45, 0.9), ['TET above soft limit'], 10);
  }
  if (vibe.last > 1.1 && !findFailure(failures, 'Bearings & Shaft')) {
    pushFailure('Bearings & Shaft', 'Vibration-driven wear', clamp(0.4 + (vibe.last - 1.1) * 0.3, 0.4, 0.85), ['Vibration amplitude'], 8);
  }
  if (oil.last < 52 && !findFailure(failures, 'Bearings & Shaft')) {
    pushFailure('Bearings & Shaft', 'Oil system degradation', 0.7, ['Oil pressure low'], 5);
  }
  if (batt.last < 25 && !findFailure(failures, 'Electrical')) {
    pushFailure('Electrical', 'Electrical system anomaly', 0.72, ['Bus voltage below nominal'], 12);
  }
  if (fuel.last > 40 && !findFailure(failures, 'Fuel System')) {
    pushFailure('Fuel System', 'Fuel flow exceedance', 0.68, ['Fuel flow above envelope'], 9);
  }
  if (pr.last < 10.5 && !findFailure(failures, 'Compressor')) {
    pushFailure('Compressor', 'Compressor performance loss', 0.65, ['EPR low'], 11);
  }

  // NOMINAL background — keeps the cards populated with realistic low-risk items
  if (failures.length === 0) {
    pushFailure('Turbine', 'Nominal wear accumulation', 0.18, ['Routine cycle accumulation'], 240);
    pushFailure('Bearings & Shaft', 'Nominal bearing life consumption', 0.14, ['None'], 310);
  }

  const top = [...failures].sort((a, b) => b.probability - a.probability)[0];
  const rootCauses: RootCause[] = failures
    .filter((f) => f.probability >= 0.35)
    .slice(0, 3)
    .map((f) => ({
      subsystem: f.subsystem,
      cause: f.failureMode.toLowerCase(),
      confidence: clamp(Math.round((f.probability * 0.9 + 0.08) * 100) / 100, 0.3, 0.96),
    }));

  const recommendedActions: string[] = [];
  const pushAction = (a: string) => {
    if (!recommendedActions.includes(a)) recommendedActions.push(a);
  };
  for (const f of failures.filter((x) => x.probability >= 0.4).slice(0, 3)) {
    pushAction(`${f.mitigationAction} (${f.subsystem})`);
    pushAction(`Schedule inspection of ${f.subsystem.toLowerCase()} within ${f.timeToFailureHours ?? 24} flight hours`);
  }
  pushAction('Continue 4-second AI diagnostic polling');
  pushAction('Review mission directive; keep within RESTRICT ENV if degrade persists');

  const block = (summary: string, findings: string[]): AssessmentBlock => ({ summary, findings });

  const report: AIDiagnosticReport = {
    generatedAt: Date.now(),
    overallStatus,
    healthScore,
    predictedRulHours: Math.max(0, Math.round(rul.last * (overallStatus === 'CRITICAL' ? 0.5 : overallStatus === 'DEGRADED' ? 0.72 : overallStatus === 'ACCEPTABLE' ? 0.88 : 1))),
    confidenceScore: 0.8,
    primaryRiskFactor: top ? `${top.subsystem} — ${top.failureMode}` : 'No significant risk detected',
    thermodynamicAssessment: block(
      `TET ${tet.last.toFixed(0)} K (trend ${tet.slopePerMin >= 0 ? '+' : ''}${tet.slopePerMin.toFixed(0)} K/min), engine pressure ratio ${pr.last.toFixed(2)}, thermal efficiency ${eff.last.toFixed(1)}%.`,
      [
        `TET window ${tet.min.toFixed(0)}–${tet.max.toFixed(0)} K`,
        `EPR window ${pr.min.toFixed(2)}–${pr.max.toFixed(2)}`,
        `Efficiency ${eff.last.toFixed(1)}% vs nominal 41%`,
      ],
    ),
    mechanicalStressAssessment: block(
      `Blade stress ${stress.last.toFixed(0)} MPa, vibration ${vibe.last.toFixed(2)} g RMS.`,
      [
        `Vibration mean ${vibe.mean.toFixed(2)} g RMS (limit 1.2)`,
        `Blade stress peak ${stress.max.toFixed(0)} MPa (limit 700 soft)`,
        `Oil pressure ${oil.last.toFixed(0)} PSI (limit 55 soft)`,
      ],
    ),
    electricalAuxiliaryAssessment: block(
      `DC bus at ${batt.last.toFixed(2)} V.`,
      [
        `Battery voltage min ${batt.min.toFixed(2)} V (limit 25.5 soft)`,
        `Fuel flow ${fuel.last.toFixed(1)} L/h (limit 36 soft)`,
      ],
    ),
    rootCauseAnalysis: rootCauses,
    recommendedActions,
    probableFailures: failures,
    drdoComplianceStatus:
      overallStatus === 'DEGRADED' || overallStatus === 'CRITICAL'
        ? 'CONDITIONAL — exceedance noted; landing criteria apply'
        : 'PASS — all parameters within DRDO certification envelope',
    isAiGenerated: true,
  };

  return report;
}