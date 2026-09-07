import { driveToTelemetry } from '../src/lib/engineCore';
import { mulberry32 } from '../src/lib/nominal';
import type { EngineTelemetry, TelemetryFrame } from '../src/lib/types';

let seq = 0;

export function makeFrame(overrides: Partial<EngineTelemetry> = {}, ts = Date.now()): TelemetryFrame {
  const base = driveToTelemetry({ throttle: 70, altitude: 5000 }, mulberry32(1), 98, 1250);
  return {
    id: ++seq,
    ts,
    source: 'LIVE_SIM',
    telemetry: { ...base, ...overrides, entropyPoints: overrides.entropyPoints ?? base.entropyPoints },
  };
}

export function makeTelemetry(overrides: Partial<EngineTelemetry> = {}): EngineTelemetry {
  return makeFrame(overrides).telemetry;
}