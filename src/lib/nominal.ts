// ---------------------------------------------------------------------------
// Nominal operating envelope — calibrated to the DRDO Mission 01 sample
// flight dataset (drdo-cruise-01, 60 s @ 1 Hz): steady 70% PLA cruise at
// 5,000 m on the GAS418S turbo-supercharged core. Sample cruise values:
// thrust ~51 kN, N2 ~12,000 rpm, TET ~1,090 K, EPR ~15.4, blade stress
// ~590 MPa, 31.5 L/h, 28.2 V, 70 PSI, 0.81 g. healthIndex follows the
// sample's mission-health convention (~66 at a fresh surveillance cruise).
// Field semantics: n2Rpm = gas-generator spool speed, thrust = core thrust,
// tet = turbine entry temperature, pressureRatio = engine pressure ratio,
// bladeStress = turbine blade-root stress. Envelope midpoints, NOT certified
// limits.
// ---------------------------------------------------------------------------

export const NOMINAL = {
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
} as const;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Approximate standard-normal noise in roughly [-1, 1] */
export function gauss(rng: () => number): number {
  return (rng() + rng() + rng() - 1.5) / 1.5;
}