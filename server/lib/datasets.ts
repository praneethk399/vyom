import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clamp, mulberry32 } from '../../src/lib/nominal';
import { driveToTelemetry, type DriveParams } from '../../src/lib/engineCore';
import type { EngineTelemetry, FlightDataset } from '../../src/lib/types';

export interface Segment {
  durSec: number;
  throttle: number;
  altitude: number;
  drive?: DriveParams;
  /** Linear ramp of a fault parameter across the segment */
  ramp?: { param: 'vibeBoost' | 'battDrop' | 'tetBoost' | 'stressBoost' | 'fuelBoost'; to: number }[];
}

export interface DatasetSpec {
  id: string;
  missionId: string;
  name: string;
  description: string;
  conditions: string;
  samplingRateHz: number;
  startTime: string;
  healthStart: number;
  rulStart: number;
  reliability: FlightDataset['reliability'];
  segments: Segment[];
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function buildDataset(spec: DatasetSpec): FlightDataset {
  const rng = mulberry32(hashStr(spec.id));
  const frames: EngineTelemetry[] = [];
  let health = spec.healthStart;
  let rul = spec.rulStart;
  let durationSec = 0;

  for (const seg of spec.segments) {
    const steps = Math.round(seg.durSec * spec.samplingRateHz);
    for (let i = 0; i < steps; i++) {
      const f = steps > 1 ? i / (steps - 1) : 0;
      const drive: DriveParams = {
        throttle: seg.throttle + (rng() - 0.5) * 0.8,
        altitude: seg.altitude + (rng() - 0.5) * 12,
        ...seg.drive,
      };
      for (const r of seg.ramp ?? []) {
        drive[r.param] = (seg.drive?.[r.param] ?? 0) + r.to * f;
      }
      const frame = driveToTelemetry(drive, rng, health, rul);
      // degrade health/rul as a function of thermal + vibration stress
      // (bands at the sample envelope's scale: TET soft 1,160, vibe soft 1.2)
      const stress =
        Math.max(0, (frame.tet - 1090) / 250) + Math.max(0, (frame.vibration - 0.8) / 2.5) + Math.max(0, (70.5 - frame.oilPressure) / 40);
      health = clamp(health - stress * 0.14 * (1 / spec.samplingRateHz), 18, 100);
      rul = Math.max(0, rul - 0.00028 / spec.samplingRateHz);
      frames.push(frame);
      durationSec += 1 / spec.samplingRateHz;
    }
  }

  return {
    id: spec.id,
    missionId: spec.missionId,
    name: spec.name,
    description: spec.description,
    conditions: spec.conditions,
    samplingRateHz: spec.samplingRateHz,
    durationSec: Math.round(durationSec),
    frameCount: frames.length,
    startTime: spec.startTime,
    reliability: spec.reliability,
    frames,
  };
}

const SPECS: DatasetSpec[] = [
  {
    id: 'drdo-mission-02',
    missionId: 'M-02',
    name: 'DRDO Mission 02: High-Speed Dash & Recovery',
    description: 'Full-envelope dash profile with a recorded vibration excursion mid-cruise.',
    conditions: 'Turbulent · dash segment at max PLA',
    samplingRateHz: 10,
    startTime: '2026-09-03T11:40:00Z',
    healthStart: 66.3,
    rulStart: 1249,
    reliability: { grade: 'B', completionPct: 88, directive: 'FULL ENVELOPE — DASH', faultsLogged: 1 },
    segments: [
      { durSec: 25, throttle: 74, altitude: 4800, drive: { tetBoost: 15 } },
      // dash peaks in the WARNING band (TET ~1,213 K), matching the mission
      // log's single recorded excursion — no critical breaches
      { durSec: 70, throttle: 78, altitude: 4100, ramp: [{ param: 'tetBoost', to: 40 }, { param: 'vibeBoost', to: 0.2 }] },
      { durSec: 90, throttle: 72, altitude: 5000 },
      {
        durSec: 80,
        throttle: 74,
        altitude: 4900,
        ramp: [{ param: 'vibeBoost', to: 1.35 }, { param: 'stressBoost', to: 140 }, { param: 'tetBoost', to: 30 }],
      },
      { durSec: 50, throttle: 58, altitude: 4700 },
    ],
  },
  {
    id: 'drdo-mission-03',
    missionId: 'M-03',
    name: 'DRDO Mission 03: Ferry & Endurance Profile',
    description: 'Long-range ferry with an endurance loiter and a DC-bus sag event late in the sortie.',
    conditions: 'Long endurance · electrical load high',
    samplingRateHz: 10,
    startTime: '2026-09-05T02:05:00Z',
    healthStart: 66.1,
    rulStart: 1249,
    reliability: { grade: 'C', completionPct: 79, directive: 'ENDURANCE CRUISE — MAX RANGE', faultsLogged: 1 },
    segments: [
      { durSec: 260, throttle: 74, altitude: 5000, drive: { effDrop: 1.2 } },
      { durSec: 120, throttle: 60, altitude: 5100 },
      {
        durSec: 90,
        throttle: 66,
        altitude: 4900,
        ramp: [{ param: 'battDrop', to: 6.8 }, { param: 'fuelBoost', to: 3.5 }],
      },
      { durSec: 45, throttle: 42, altitude: 3900 },
    ],
  },
];

const SAMPLE_PATH = fileURLToPath(new URL('../data/drdo-cruise-01.json', import.meta.url));

/**
 * The recorded DRDO Mission 01 sample flight dataset — the reference capture
 * the whole envelope is calibrated against, served verbatim as a replay
 * scenario (missing meta filled with its mission-record values).
 */
function loadSampleDataset(): FlightDataset {
  const raw = JSON.parse(readFileSync(SAMPLE_PATH, 'utf-8')) as {
    id: string;
    name: string;
    description: string;
    samplingRateHz: number;
    durationSeconds: number;
    frames: (EngineTelemetry & { timestamp: number })[];
  };
  // the capture carries epoch-ms timestamps per frame; the canonical schema
  // keeps timing in the ring frame (ts), so strip it from the telemetry body
  const startTime = new Date(raw.frames[0]?.timestamp ?? Date.now()).toISOString();
  const frames: EngineTelemetry[] = raw.frames.map(({ timestamp: _ts, ...f }) => ({ ...f }));
  return {
    id: raw.id,
    missionId: 'M-01',
    name: raw.name,
    description: raw.description,
    conditions: 'Clear air · steady loiter at 5,000 m · recorded capture',
    samplingRateHz: raw.samplingRateHz,
    durationSec: raw.durationSeconds,
    frameCount: frames.length,
    startTime,
    reliability: { grade: 'A', completionPct: 100, directive: 'RESTRICT ENV — SURVEILLANCE LOITER', faultsLogged: 0 },
    frames,
  };
}

const DATASETS: FlightDataset[] = [loadSampleDataset(), ...SPECS.map(buildDataset)];

export function getAllDatasets(): FlightDataset[] {
  return DATASETS;
}

export function getDatasetById(id: string): FlightDataset | undefined {
  return DATASETS.find((d) => d.id === id);
}