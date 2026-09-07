import { NOMINAL, clamp, lerp, mulberry32 } from '../../lib/nominal';
import { driveToTelemetry, type DriveParams } from '../../lib/engineCore';
import type { EngineTelemetry, FaultClass } from '../../lib/types';

export interface FaultProfile {
  label: string;
  drive: DriveParams;
  healthBurnPerSec: number; // healthIndex points lost per second at full fault
  rulBurnPerSec: number; // rulHours consumed per second at full fault
}

export const FAULT_PROFILES: Record<FaultClass, FaultProfile> = {
  NORMAL: {
    label: 'NOMINAL',
    drive: {},
    healthBurnPerSec: 0,
    rulBurnPerSec: 0,
  },
  TET_RUNWAY: {
    label: 'TET RUNAWAY',
    drive: { tetBoost: 230, stressBoost: 150, effDrop: 14, vibeBoost: 0.5 },
    healthBurnPerSec: 0.3,
    rulBurnPerSec: 0.06,
  },
  VIBRATION_GROWTH: {
    label: 'VIBRATION GROWTH',
    drive: { vibeBoost: 2.2, stressBoost: 110, n2Drop: 220 },
    healthBurnPerSec: 0.24,
    rulBurnPerSec: 0.045,
  },
  OIL_PRESSURE_LOSS: {
    label: 'OIL PRESSURE LOSS',
    drive: { oilDrop: 36, vibeBoost: 0.6 },
    healthBurnPerSec: 0.34,
    rulBurnPerSec: 0.055,
  },
  COMPRESSOR_STALL: {
    label: 'COMPRESSOR SURGE',
    // magnitudes at the sample envelope's scale: EPR 15.4 -> ~9 (past the
    // 11 soft floor), thrust -12 kN, N2 -1200, TET +90, vibe +1.4
    drive: { prDrop: 5.6, effDrop: 24, vibeBoost: 1.4, thrustDrop: 12, n2Drop: 1200, tetBoost: 90 },
    healthBurnPerSec: 0.44,
    rulBurnPerSec: 0.08,
  },
  FUEL_FLOW_ANOMALY: {
    label: 'FUEL FLOW ANOMALY',
    drive: { fuelBoost: 18, tetBoost: 90, effDrop: 8 },
    healthBurnPerSec: 0.2,
    rulBurnPerSec: 0.04,
  },
  BATTERY_SAG: {
    label: 'BATTERY SAG',
    drive: { battDrop: 7.6 },
    healthBurnPerSec: 0.13,
    rulBurnPerSec: 0.025,
  },
};

export const FAULT_CLASSES: FaultClass[] = [
  'NORMAL',
  'TET_RUNWAY',
  'VIBRATION_GROWTH',
  'OIL_PRESSURE_LOSS',
  'COMPRESSOR_STALL',
  'FUEL_FLOW_ANOMALY',
  'BATTERY_SAG',
];

interface Regime {
  throttle: number;
  altitude: number;
}

/** ~90 s mission regime loop: climb -> cruise -> loiter -> climb (PLA centered on the sample's 70% cruise midpoint, peaks kept under the 1,160 K soft TET) */
function regimeAt(t: number): Regime {
  const phase = (t % 90) / 90;
  if (phase < 0.22) return { throttle: lerp(62, 75, phase / 0.22), altitude: lerp(4600, 5200, phase / 0.22) };
  if (phase < 0.6) return { throttle: 70, altitude: 5000 };
  if (phase < 0.88) return { throttle: lerp(70, 58, (phase - 0.6) / 0.28), altitude: 5050 };
  return { throttle: lerp(58, 75, (phase - 0.88) / 0.12), altitude: lerp(5050, 5200, (phase - 0.88) / 0.12) };
}

/**
 * Procedural LIVE_SIM generator — client-side only, no server round-trip.
 * Deterministic for a given seed so fault-injection tests are stable.
 */
export class LiveSimulator {
  private t = 0;
  private rng: () => number;
  private fault: FaultClass = 'NORMAL';
  private faultLevel = 0;
  private health: number = NOMINAL.healthIndex;
  private rul: number = NOMINAL.rulHours;

  constructor(seed = 20260) {
    this.rng = mulberry32(seed);
  }

  setFault(f: FaultClass): void {
    this.fault = f;
  }

  getHealth(): number {
    return this.health;
  }

  getRul(): number {
    return this.rul;
  }

  advance(dtSec: number): EngineTelemetry {
    this.t += dtSec;
    const rng = this.rng;
    const target = this.fault === 'NORMAL' ? 0 : 1;
    // fast attack, slower recovery — quick so the demo ladder shows within seconds
    const speed = target > this.faultLevel ? 1.3 : 0.5;
    this.faultLevel = lerp(this.faultLevel, target, 1 - Math.exp(-speed * dtSec));
    const f = this.faultLevel;
    const profile = FAULT_PROFILES[this.fault];

    // health: burn while faulted, slow regression toward the nominal mean otherwise
    if (f < 0.05) this.health += (NOMINAL.healthIndex - this.health) * 0.02 * dtSec;
    this.health = clamp(this.health - profile.healthBurnPerSec * dtSec * f, 12, 100);
    // RUL: nominal ~1 h per real hour of flight + accelerated burn under fault
    this.rul = Math.max(0, this.rul - (0.00028 + profile.rulBurnPerSec * f) * dtSec);

    const reg = regimeAt(this.t);
    const drive: DriveParams = {
      throttle: reg.throttle + gaussJitter(rng, 0.4),
      altitude: reg.altitude + gaussJitter(rng, 8),
      ...scaleDrive(profile.drive, f),
    };
    const telemetry = driveToTelemetry(drive, rng, this.health, this.rul);
    // scrub residual noise so the count-up gauges read clean
    telemetry.throttle = clamp(Math.round(telemetry.throttle), 0, 100);
    return telemetry;
  }
}

function gaussJitter(rng: () => number, amp: number): number {
  return (rng() + rng() + rng() - 1.5) / 1.5 * amp;
}

function scaleDrive(drive: DriveParams, f: number): DriveParams {
  const out: DriveParams = {};
  (Object.keys(drive) as (keyof DriveParams)[]).forEach((k) => {
    if (k === 'throttle' || k === 'altitude') return;
    out[k] = (drive[k] ?? 0) * f;
  });
  return out;
}