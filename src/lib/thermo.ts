import type { EntropyPoints } from './types';

export const GAMMA = 1.4;

export function isentropicExponent(pressureRatio: number): number {
  return Math.pow(pressureRatio, (GAMMA - 1) / GAMMA);
}

/** ISA lapse-rate ambient temperature at altitude */
export function ambientTempAtAltitude(altitudeM: number): number {
  return 288.15 - 6.5 * (altitudeM / 1000);
}

export interface TsLoopPoint {
  s: number;
  t: number;
}

export interface TsLoops {
  real: TsLoopPoint[];
  ideal: TsLoopPoint[];
}

/**
 * Closed Brayton loops for the T–s diagram.
 * Real loop comes from telemetry entropyPoints; the dim "ideal cycle"
 * reference loop is computed from the isentropic relations so the
 * real cycle's deviation is visible at a glance.
 */
export function buildTsLoops(entropyPoints: EntropyPoints, tet: number, pressureRatio: number): TsLoops {
  const s = entropyPoints.s;
  const t = entropyPoints.t;
  const ex = isentropicExponent(Math.max(1.01, pressureRatio));
  const t1 = t[0] > 0 ? t[0] : ambientTempAtAltitude(4600);
  const t2s = t1 * ex;
  const t3 = tet > 0 ? tet : t[2];
  const t4s = t3 / ex;

  const real: TsLoopPoint[] = [
    { s: s[0], t: t1 },
    { s: s[1], t: t[1] > 0 ? t[1] : t2s },
    { s: s[2], t: t3 },
    { s: s[3], t: t[3] > 0 ? t[3] : t4s },
  ];
  const ideal: TsLoopPoint[] = [
    { s: s[0], t: t1 },
    { s: s[0], t: t2s },
    { s: s[2], t: t3 },
    { s: s[2], t: t4s },
  ];
  return { real, ideal };
}

/** Entropy rise across compressor (2-1) and turbine (4-3) — the irreversibility signature */
export function cycleDeviations(entropyPoints: EntropyPoints): { compRise: number; turbRise: number } {
  const s = entropyPoints.s;
  return {
    compRise: Math.max(0, s[1] - s[0]),
    turbRise: Math.max(0, s[3] - s[2]),
  };
}