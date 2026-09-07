import { NOMINAL, clamp, gauss } from './nominal';
import { ambientTempAtAltitude, isentropicExponent } from './thermo';
import type { EngineTelemetry } from './types';

export interface DriveParams {
  throttle?: number;
  altitude?: number;
  tetBoost?: number;
  vibeBoost?: number;
  oilDrop?: number;
  battDrop?: number;
  fuelBoost?: number;
  prDrop?: number;
  effDrop?: number;
  stressBoost?: number;
  n2Drop?: number;
  thrustDrop?: number;
}

/**
 * Derive a full EngineTelemetry frame from drive conditions + noise.
 * Shared by the LIVE_SIM generator and the server-side FlightDataset
 * generator so both stay on the same nominal envelope.
 */
export function driveToTelemetry(
  drive: DriveParams,
  rng: () => number,
  health: number,
  rul: number,
): EngineTelemetry {
  const throttle = clamp(drive.throttle ?? 70, 0, 100);
  const altitude = clamp(drive.altitude ?? 5000, 0, 9000);

  // Response curves fitted to the sample dataset's PLA slopes (Δ between the
  // 70% and 73% PLA cruise bands): core thrust +0.68 kN/%, N2 +128 rpm/%,
  // TET +10.4 K/%, EPR +0.19/%, blade stress +7.2 MPa/%, fuel +0.36 L/h/%.
  // At cruise PLA=70 every channel lands on its NOMINAL midpoint.
  const thrust = NOMINAL.thrust + 0.68 * (throttle - 70) - (drive.thrustDrop ?? 0) + gauss(rng) * 0.25;
  const n2Rpm = NOMINAL.n2Rpm + 128 * (throttle - 70) - (drive.n2Drop ?? 0) + gauss(rng) * 45;
  const tet = NOMINAL.tet + 10.4 * (throttle - 70) + (drive.tetBoost ?? 0) + gauss(rng) * 4.5;
  const pressureRatio =
    NOMINAL.pressureRatio + 0.19 * (throttle - 70) - (drive.prDrop ?? 0) + gauss(rng) * 0.09;
  const bladeStress =
    NOMINAL.bladeStress + 7.2 * (throttle - 70) + (drive.stressBoost ?? 0) + gauss(rng) * 6;
  const efficiency = clamp(NOMINAL.efficiency - (drive.effDrop ?? 0) + gauss(rng) * 0.25, 30, 100);
  const batteryVoltage = NOMINAL.batteryVoltage - (drive.battDrop ?? 0) + gauss(rng) * 0.07;
  const oilPressure = NOMINAL.oilPressure - (drive.oilDrop ?? 0) + gauss(rng) * 0.8;
  const vibration =
    NOMINAL.vibration + 0.015 * (throttle - 70) + (drive.vibeBoost ?? 0) + Math.abs(gauss(rng)) * 0.035;
  const fuelFlow = NOMINAL.fuelFlow + 0.36 * (throttle - 70) + (drive.fuelBoost ?? 0) + gauss(rng) * 0.25;

  const t1 = ambientTempAtAltitude(altitude);
  const ex = isentropicExponent(Math.max(1.01, pressureRatio));
  const t2 = t1 * ex;
  // non-ideal turbine expansion (η_t ≈ 0.85) — reproduces the sample capture's
  // state-4 temp (~603 K at TET 1,081, vs ~521 K isentropic)
  const t4 = tet * (1 - 0.85 * (1 - 1 / ex));

  const prDropFrac = clamp((drive.prDrop ?? 0) / 7, 0, 1);
  const tetBoostFrac = clamp((drive.tetBoost ?? 0) / 450, 0, 1);

  // Entropy anchors follow the sample dataset's Brayton signature
  // (s=[1.1, 1.236, 2.765, 3.025] kJ/kg·K at nominal); fault fractions widen
  // the compressor/turbine entropy rises so degradation is visible on the T–s loop.
  const entropyPoints = {
    s: [1.1, 1.1 + 0.136 + 0.06 * prDropFrac, 2.765, 2.765 + 0.26 + 0.05 * tetBoostFrac],
    t: [t1, t2, tet, t4],
  };

  return {
    throttle,
    altitude,
    thrust,
    n2Rpm,
    tet,
    pressureRatio,
    bladeStress,
    efficiency,
    batteryVoltage,
    oilPressure,
    vibration,
    fuelFlow,
    healthIndex: clamp(health, 0, 100),
    rulHours: Math.max(0, rul),
    entropyPoints,
  };
}