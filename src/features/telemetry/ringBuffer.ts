import type { TelemetryFrame } from '../../lib/types';

/** Append a frame to the ring, keeping only the newest `max` entries */
export function pushRing(ring: TelemetryFrame[], frame: TelemetryFrame, max: number): TelemetryFrame[] {
  if (ring.length >= max) return [...ring.slice(ring.length - max + 1), frame];
  return [...ring, frame];
}

/** Evenly subsample the last `maxPoints` frames of the ring */
export function sampleWindow(ring: TelemetryFrame[], maxPoints: number): TelemetryFrame[] {
  if (ring.length <= maxPoints) return ring;
  const step = ring.length / maxPoints;
  const out: TelemetryFrame[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = i === maxPoints - 1 ? ring.length - 1 : Math.min(ring.length - 1, Math.floor(i * step));
    out.push(ring[idx]);
  }
  return out;
}

/** Chart series for one scalar parameter */
export function windowSeries(
  ring: TelemetryFrame[],
  param: 'tet' | 'n2Rpm' | 'thrust' | 'oilPressure' | 'vibration' | 'fuelFlow' | 'batteryVoltage' | 'efficiency' | 'bladeStress' | 'pressureRatio' | 'healthIndex',
): { t: number; v: number }[] {
  const start = ring.length > 0 ? ring[0].ts : 0;
  return ring.map((f) => ({ t: (f.ts - start) / 1000, v: f.telemetry[param] }));
}

export function lastNFrames(ring: TelemetryFrame[], n: number): TelemetryFrame[] {
  return ring.slice(-n);
}

export function frameAge(ring: TelemetryFrame[], now = Date.now()): number | null {
  if (ring.length === 0) return null;
  return now - ring[ring.length - 1].ts;
}