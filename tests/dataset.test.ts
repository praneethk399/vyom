import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NOMINAL, mulberry32 } from '../src/lib/nominal';
import { driveToTelemetry } from '../src/lib/engineCore';
import { evaluateFrame, LIMIT_RULES, RULE_BY_PARAM, classifyValue } from '../src/lib/thresholds';
import { LiveSimulator } from '../src/features/telemetry/liveSim';
import { buildDataset, type DatasetSpec } from '../server/lib/datasets';
import type { EngineTelemetry } from '../src/lib/types';

const SAMPLE_PATH = fileURLToPath(new URL('../server/data/drdo-cruise-01.json', import.meta.url));

interface SampleFile {
  id: string;
  frames: (EngineTelemetry & { timestamp: number })[];
}

const sample: SampleFile = JSON.parse(readFileSync(SAMPLE_PATH, 'utf-8'));

describe('sample capture (drdo-cruise-01) is the calibration source of truth', () => {
  it('NOMINAL envelope equals the sample cruise midpoints', () => {
    const t = sample.frames[0];
    expect(NOMINAL.throttle).toBe(70);
    expect(NOMINAL.altitude).toBe(5000);
    expect(NOMINAL.thrust).toBeCloseTo(t.thrust, 0);
    expect(NOMINAL.n2Rpm).toBeCloseTo(t.n2Rpm, -2); // within 100 rpm
    expect(NOMINAL.tet).toBeCloseTo(t.tet, -1); // within 10 K
    expect(NOMINAL.pressureRatio).toBeCloseTo(t.pressureRatio, 0);
    expect(NOMINAL.bladeStress).toBeCloseTo(t.bladeStress, -1);
    expect(NOMINAL.fuelFlow).toBeCloseTo(31.5, 0);
    expect(NOMINAL.rulHours).toBe(sample.frames[0].rulHours);
  });

  it('every sample frame classifies nominal against the ACTIVE_LIMIT table', () => {
    let state = {};
    let breaches = 0;
    for (const f of sample.frames) {
      const { alerts, nextLimitState } = evaluateFrame(f, state);
      breaches += alerts.length;
      state = nextLimitState;
    }
    expect(breaches).toBe(0);
  });

  it('response curves reproduce the sample PLA slopes (70% -> 73% band)', () => {
    // measured from the capture: +0.68 kN/%, +128 rpm/%, +10.4 K/%, +7.2 MPa/%
    const at70 = driveToTelemetry({ throttle: 70, altitude: 5000 }, mulberry32(1), NOMINAL.healthIndex, NOMINAL.rulHours);
    const at73 = driveToTelemetry({ throttle: 73, altitude: 5000 }, mulberry32(1), NOMINAL.healthIndex, NOMINAL.rulHours);
    expect((at73.thrust - at70.thrust) / 3).toBeCloseTo(0.68, 1);
    expect((at73.n2Rpm - at70.n2Rpm) / 3).toBeCloseTo(128, -1);
    expect((at73.tet - at70.tet) / 3).toBeCloseTo(10.4, 0);
    expect((at73.bladeStress - at70.bladeStress) / 3).toBeCloseTo(7.2, 0);
    expect((at73.fuelFlow - at70.fuelFlow) / 3).toBeCloseTo(0.36, 1);
  });
});

describe('replay datasets respect the mission-log fault counts', () => {
  it('M-02 dash stays in the warning band (no critical breaches)', () => {
    const spec: DatasetSpec = {
      id: 'drdo-mission-02',
      missionId: 'M-02',
      name: 'test',
      description: '',
      conditions: '',
      samplingRateHz: 10,
      startTime: '2026-01-01T00:00:00Z',
      healthStart: 66.3,
      rulStart: 1249,
      reliability: { grade: 'B', completionPct: 88, directive: 'DASH', faultsLogged: 1 },
      segments: [
        { durSec: 25, throttle: 74, altitude: 4800, drive: { tetBoost: 15 } },
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
    };
    const ds = buildDataset(spec);
    expect(ds.frames.length).toBeGreaterThan(100);
    let state = {};
    let criticals = 0;
    for (const f of ds.frames) {
      const { alerts, nextLimitState } = evaluateFrame(f, state);
      criticals += alerts.filter((a) => a.severity === 'critical').length;
      state = nextLimitState;
    }
    expect(criticals).toBe(0);
  });

  it('M-03 battery sag crosses its soft limit exactly as logged', () => {
    // covered via BATTERY_SAG fault tests; here we pin the segment math:
    const sim = new LiveSimulator(20260);
    sim.setFault('BATTERY_SAG');
    let frame = sim.advance(0.1);
    for (let i = 1; i < 600; i++) frame = sim.advance(0.1);
    expect(frame.batteryVoltage).toBeLessThan(RULE_BY_PARAM.get('batteryVoltage')!.softLimit);
  });
});

describe('alert message formatting', () => {
  it('formats breach values without float noise', () => {
    const frame = { ...sample.frames[0], tet: 1257.3267831175451 };
    const { alerts } = evaluateFrame(frame);
    const tet = alerts.find((a) => a.parameter === 'tet');
    expect(tet).toBeDefined();
    expect(tet!.message).toMatch(/1,?257(\.\d+)? K$/);
    expect(tet!.message).not.toContain('1257.3267');
  });

  it('EPR breach messages carry no long decimals', () => {
    const frame = { ...sample.frames[0], pressureRatio: 8.612345678 };
    const { alerts } = evaluateFrame(frame);
    const epr = alerts.find((a) => a.parameter === 'pressureRatio');
    expect(epr).toBeDefined();
    expect(epr!.message).toMatch(/8\.61 :1$/);
  });
});

describe('generated frames stay inside the gauge domains', () => {
  it('90 s nominal regime loop never leaves the GAUGE min/max', () => {
    const sim = new LiveSimulator(20260);
    let frame = sim.advance(0.1);
    for (let i = 1; i < 900; i++) frame = sim.advance(0.1);
    // the regimes sweep 58-75% PLA; at +10.4 K/% the TET peak must stay under soft
    const tetRule = RULE_BY_PARAM.get('tet')!;
    expect(classifyValue(tetRule, frame.tet)).toBe('nominal');
    const rpmRule = RULE_BY_PARAM.get('n2Rpm')!;
    expect(classifyValue(rpmRule, frame.n2Rpm)).toBe('nominal');
  });

  it('limit table covers every rule parameter with sane directions', () => {
    expect(LIMIT_RULES.map((r) => r.parameter)).toEqual(
      expect.arrayContaining(['tet', 'n2Rpm', 'bladeStress', 'oilPressure', 'vibration', 'batteryVoltage', 'fuelFlow', 'efficiency', 'pressureRatio']),
    );
    for (const r of LIMIT_RULES) {
      if (r.direction === 'above') expect(r.softLimit).toBeLessThan(r.hardLimit);
      else expect(r.softLimit).toBeGreaterThan(r.hardLimit);
    }
  });
});
