import type { AlertNotification, EngineTelemetry, Severity } from './types';

// ---------------------------------------------------------------------------
// Deterministic layer — instant, client-side. No network, no latency.
// Numbers are placeholders tuned to nominal ranges, not certified limits.
// ---------------------------------------------------------------------------

export type ThresholdParameter =
  | 'tet'
  | 'n2Rpm'
  | 'bladeStress'
  | 'oilPressure'
  | 'vibration'
  | 'batteryVoltage'
  | 'fuelFlow'
  | 'efficiency'
  | 'pressureRatio';

export interface LimitRule {
  parameter: ThresholdParameter;
  label: string;
  unit: string;
  softLimit: number;
  hardLimit: number;
  direction: 'above' | 'below';
  message: string;
}

// Limits calibrated to the sample flight dataset's operating band and typical
// small-turbofan/GAS418S core limits: TET soft 1,160 K / hard 1,250 K,
// N2 overspeed above 13,800 (redline ~14,200), blade stress 700/820 MPa,
// EPR 11/8.5 min, oil 55/38 PSI, vibration 1.2/2.5 g, 28 V DC bus,
// fuel 38/45 L/h, thermal efficiency 34/26 %.
export const LIMIT_RULES: LimitRule[] = [
  { parameter: 'tet', label: 'TURBINE ENTRY TEMP', unit: 'K', softLimit: 1160, hardLimit: 1250, direction: 'above', message: 'TET beyond soft limit' },
  { parameter: 'n2Rpm', label: 'N2 SPOOL SPEED', unit: 'rpm', softLimit: 13800, hardLimit: 14200, direction: 'above', message: 'N2 overspeed' },
  { parameter: 'bladeStress', label: 'BLADE ROOT STRESS', unit: 'MPa', softLimit: 700, hardLimit: 820, direction: 'above', message: 'Blade root stress high' },
  { parameter: 'oilPressure', label: 'OIL PRESSURE', unit: 'PSI', softLimit: 55, hardLimit: 38, direction: 'below', message: 'Oil pressure low' },
  { parameter: 'vibration', label: 'VIBRATION', unit: 'g RMS', softLimit: 1.2, hardLimit: 2.5, direction: 'above', message: 'Vibration amplitude high' },
  { parameter: 'batteryVoltage', label: 'BATTERY VOLTAGE', unit: 'V', softLimit: 25.5, hardLimit: 23, direction: 'below', message: 'DC bus voltage sag' },
  { parameter: 'fuelFlow', label: 'FUEL FLOW', unit: 'L/h', softLimit: 38, hardLimit: 45, direction: 'above', message: 'Fuel flow above limit' },
  { parameter: 'efficiency', label: 'THERMAL EFFICIENCY', unit: '%', softLimit: 34, hardLimit: 26, direction: 'below', message: 'Thermal efficiency degraded' },
  { parameter: 'pressureRatio', label: 'ENGINE PRESSURE RATIO', unit: ':1', softLimit: 11, hardLimit: 8.5, direction: 'below', message: 'EPR below floor — compressor degradation' },
];

export const RULE_BY_PARAM = new Map<string, LimitRule>(LIMIT_RULES.map((r) => [r.parameter, r]));

export function classifyValue(rule: LimitRule, value: number): Severity {
  if (rule.direction === 'above') {
    if (value >= rule.hardLimit) return 'critical';
    if (value >= rule.softLimit) return 'warning';
  } else {
    if (value <= rule.hardLimit) return 'critical';
    if (value <= rule.softLimit) return 'warning';
  }
  return 'nominal';
}

const RANK: Record<Severity, number> = { nominal: 0, caution: 1, warning: 2, critical: 3 };

export type LimitState = Partial<Record<ThresholdParameter, Severity>>;

export interface ThresholdResult {
  alerts: AlertNotification[];
  nextLimitState: LimitState;
}

/** De-escalation hold band as a fraction of the soft–hard span (per rule) */
const HYSTERESIS_FRACTION = 0.1;

/**
 * Check one frame against the ACTIVE_LIMIT table. Alerts are only raised on
 * escalation (or fresh breach); de-escalation is hysteretic — the value must
 * clear the next threshold by a margin before the state steps down, so a
 * sensor value oscillating across a boundary cannot re-arm and re-fire the
 * same breach frame after frame.
 */
export function evaluateFrame(frame: EngineTelemetry, prevState: LimitState = {}, now = Date.now()): ThresholdResult {
  const alerts: AlertNotification[] = [];
  const next: LimitState = { ...prevState };
  let seq = 0;
  for (const rule of LIMIT_RULES) {
    const value = frame[rule.parameter];
    const sev = classifyValue(rule, value);
    const prev = prevState[rule.parameter] ?? 'nominal';
    if (sev === prev) continue;
    if (RANK[sev] < RANK[prev]) {
      // De-escalation is hysteretic: the value must clear the next threshold
      // by a margin before the state steps down, so noise oscillating across
      // a boundary cannot re-arm and re-fire the same breach every frame.
      const hyst = Math.abs(rule.hardLimit - rule.softLimit) * HYSTERESIS_FRACTION;
      const above = rule.direction === 'above';
      const threshold = prev === 'critical' ? rule.hardLimit : rule.softLimit;
      const cleared = above ? value < threshold - hyst : value > threshold + hyst;
      if (!cleared) continue; // hold previous severity silently
    }
    if (sev === 'nominal') delete next[rule.parameter];
    else next[rule.parameter] = sev;
    if (RANK[sev] > RANK[prev] && sev !== 'nominal') {
      alerts.push({
        id: `limit:${rule.parameter}:${now}:${seq++}`,
        ts: now,
        severity: sev,
        category: 'ACTIVE_LIMIT',
        title: `${rule.label} — LIMIT BREACH`,
        message: `${rule.message} · ${formatLimitValue(value)} ${rule.unit}`,
        parameter: rule.parameter,
        source: 'threshold',
        acknowledged: false,
      });
    }
  }
  return { alerts, nextLimitState: next };
}

/** Alert-message formatting — RPM integer, EPR/oil/vibe/batt 2 dp, rest 0–1 dp */
function formatLimitValue(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 100) return v.toFixed(1);
  return v.toFixed(2);
}

/** Nominal d(parameter)/d(throttle) from the engineCore response curves */
const TET_PER_THROTTLE = 10.4; // K per % PLA
const STRESS_PER_THROTTLE = 7.2; // MPa per % PLA

/** Least-squares slope of a series (per index) */
export function linSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += values[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (values[i] - my);
    den += (i - mx) * (i - mx);
  }
  return den === 0 ? 0 : num / den;
}

export interface PrecursorSeriesPoint {
  ts: number;
  tet: number;
  vibration: number;
  bladeStress: number;
  throttle: number;
}

export interface PrecursorHit {
  key: string;
  severity: Severity;
  title: string;
  message: string;
  parameter: ThresholdParameter;
}

/**
 * Sustained trends that are still under the hard limit — the "predicts before
 * the limit is hit" behavior, raised client-side with zero latency.
 */
/** Running-mean smoothing — real sensors have correlated noise, and a
 *  white-noise series would otherwise trip the slope detector by chance. */
function smooth(vals: number[], w = 5): number[] {
  const out: number[] = [];
  for (let i = 0; i < vals.length; i++) {
    const lo = Math.max(0, i - w + 1);
    let s = 0;
    for (let j = lo; j <= i; j++) s += vals[j];
    out.push(s / (i - lo + 1));
  }
  return out;
}

export function detectPrecursors(series: PrecursorSeriesPoint[], samplingHz = 10): PrecursorHit[] {
  const hits: PrecursorHit[] = [];
  if (series.length < 50) return hits; // need >= 4 s of data at 10 Hz
  if (series[series.length - 1].ts - series[0].ts < 4000) return hits;
  const n = Math.min(series.length, 60);
  const recent = series.slice(-n);

  const dt = recent.length > 1 ? (recent[recent.length - 1].ts - recent[0].ts) / (recent.length - 1) / 1000 : 0.1;
  const perMin = 60 / Math.max(dt, 0.01);

  // Detect on the RESIDUAL: subtract the slope that the throttle change itself
  // explains (dTET/dPLA, dStress/dPLA from the nominal envelope). A healthy
  // climb tracks throttle, so its residual is ~0 — only pathological rises
  // that outpace pilot demand trip the detector.
  const tetSlope = linSlope(smooth(recent.map((p) => p.tet))) * perMin;
  const stressSlope = linSlope(smooth(recent.map((p) => p.bladeStress))) * perMin;
  const thrSlope = linSlope(smooth(recent.map((p) => p.throttle))) * perMin;
  const tetResidual = tetSlope - TET_PER_THROTTLE * thrSlope;
  const stressResidual = stressSlope - STRESS_PER_THROTTLE * thrSlope;
  const vibeMean = recent.slice(-20).reduce((a, p) => a + p.vibration, 0) / Math.min(20, recent.length);

  // Trend detection only at SETTLED throttle: during climb/inject transients
  // the engine's nonlinear response leaks residual slope that looks like a
  // runaway. Real fault drifts (TET runaway, bearing wear) occur at steady
  // PLA, so this gate keeps sensitivity where it matters.
  const settledThrottle = Math.abs(thrSlope) <= 5;

  if (settledThrottle && tetResidual > 420) {
    hits.push({
      key: 'trend:tet',
      severity: 'warning',
      title: 'PREDICTIVE — TET RATE OF RISE',
      message: `TET climbing ${tetSlope.toFixed(0)} K/min — breach projected before hard limit`,
      parameter: 'tet',
    });
  } else if (settledThrottle && tetResidual > 210) {
    hits.push({
      key: 'trend:tet',
      severity: 'caution',
      title: 'PREDICTIVE — TET RATE OF RISE',
      message: `TET climbing ${tetSlope.toFixed(0)} K/min, still under hard limit`,
      parameter: 'tet',
    });
  }
  if (settledThrottle && stressResidual > 280) {
    hits.push({
      key: 'trend:bladeStress',
      severity: 'caution',
      title: 'PREDICTIVE — BLADE STRESS TREND',
      message: `Blade stress rising ${stressSlope.toFixed(0)} MPa/min`,
      parameter: 'bladeStress',
    });
  }
  if (vibeMean > 0.95 && vibeMean < 1.2) {
    hits.push({
      key: 'trend:vibration',
      severity: 'caution',
      title: 'PREDICTIVE — RISING VIBRATION TREND',
      message: `Sustained vibration ${vibeMean.toFixed(2)} g RMS, below ACTIVE_LIMIT`,
      parameter: 'vibration',
    });
  }
  void samplingHz;
  return hits;
}