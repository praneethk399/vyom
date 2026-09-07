import { describe, expect, it } from 'vitest';
import { detectPrecursors, evaluateFrame, LIMIT_RULES, linSlope } from '../src/lib/thresholds';
import { makeTelemetry } from './helpers';

describe('evaluateFrame — ACTIVE_LIMIT ladder', () => {
  it('passes a nominal frame silently', () => {
    const { alerts, nextLimitState } = evaluateFrame(makeTelemetry({ tet: 1120, vibration: 0.4 }));
    expect(alerts).toHaveLength(0);
    expect(nextLimitState).toEqual({});
  });

  it('raises warning when a soft limit is crossed', () => {
    const { alerts, nextLimitState } = evaluateFrame(makeTelemetry({ tet: 1220 }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: 'warning', category: 'ACTIVE_LIMIT', parameter: 'tet' });
    expect(nextLimitState.tet).toBe('warning');
  });

  it('raises critical when a hard limit is crossed', () => {
    const { alerts } = evaluateFrame(makeTelemetry({ tet: 1320 }));
    expect(alerts[0].severity).toBe('critical');
  });

  it('does not re-alert while the same severity persists', () => {
    const frame = makeTelemetry({ tet: 1220 });
    const first = evaluateFrame(frame);
    const second = evaluateFrame(frame, first.nextLimitState);
    expect(second.alerts).toHaveLength(0);
  });

  it('escalates warning -> critical with a fresh alert', () => {
    const first = evaluateFrame(makeTelemetry({ tet: 1220 }));
    const second = evaluateFrame(makeTelemetry({ tet: 1320 }), first.nextLimitState);
    expect(second.alerts).toHaveLength(1);
    expect(second.alerts[0].severity).toBe('critical');
  });

  it('de-escalation updates state silently', () => {
    const first = evaluateFrame(makeTelemetry({ tet: 1220 }));
    const second = evaluateFrame(makeTelemetry({ tet: 1100 }), first.nextLimitState);
    expect(second.alerts).toHaveLength(0);
    expect(second.nextLimitState.tet).toBeUndefined();
  });

  it('does not re-arm when the value oscillates across a soft limit (hysteresis)', () => {
    // value straddles the 1.2 g soft limit — the original bug re-fired the
    // breach on every frame (6 alerts in 4 s observed live)
    let state = {};
    const seq = [1.21, 1.19, 1.21, 1.2, 1.18, 1.22, 1.19, 1.21];
    let fired = 0;
    for (const v of seq) {
      const r = evaluateFrame(makeTelemetry({ vibration: v }), state);
      fired += r.alerts.length;
      state = r.nextLimitState;
    }
    expect(fired).toBe(1); // one breach, then the hold-band keeps it armed
    expect(state.vibration).toBe('warning');
  });

  it('re-fires only on genuine re-crossing after a deep dip', () => {
    // dip past the hold band (soft 1.2 - 10% of span) disarms, then a real
    // re-cross fires exactly one fresh alert — legitimate, not flapping
    const first = evaluateFrame(makeTelemetry({ vibration: 1.3 }));
    expect(first.alerts).toHaveLength(1);
    const osc = evaluateFrame(makeTelemetry({ vibration: 1.19 }), first.nextLimitState); // within band: hold
    expect(osc.alerts).toHaveLength(0);
    expect(osc.nextLimitState.vibration).toBe('warning');
    const deep = evaluateFrame(makeTelemetry({ vibration: 1.0 }), osc.nextLimitState); // 1.0 < 1.08 band: disarm
    expect(deep.nextLimitState.vibration).toBeUndefined();
    const recross = evaluateFrame(makeTelemetry({ vibration: 1.3 }), deep.nextLimitState);
    expect(recross.alerts).toHaveLength(1);
  });

  it('handles below-direction limits (oil pressure)', () => {
    const { alerts } = evaluateFrame(makeTelemetry({ oilPressure: 30 }));
    expect(alerts[0]).toMatchObject({ severity: 'critical', parameter: 'oilPressure' });
  });

  it('flags every parameter in the table', () => {
    expect(LIMIT_RULES.map((r) => r.parameter)).toEqual(
      expect.arrayContaining(['tet', 'n2Rpm', 'bladeStress', 'oilPressure', 'vibration', 'batteryVoltage', 'fuelFlow', 'efficiency', 'pressureRatio']),
    );
  });
});

describe('detectPrecursors — sustained trends under the hard limit', () => {
  it('warns on a fast TET rate of rise', () => {
    const t0 = Date.now();
    const series = Array.from({ length: 60 }, (_, i) => ({
      ts: t0 + i * 100,
      tet: 1080 + i * 2,
      vibration: 0.4,
      bladeStress: 420,
      throttle: 82,
    }));
    const hits = detectPrecursors(series, 10);
    const tetHit = hits.find((h) => h.key === 'trend:tet');
    expect(tetHit).toBeDefined();
    expect(tetHit!.severity).toBe('warning');
  });

  it('cautions on sustained vibration between 0.85 and 1.2 g', () => {
    const t0 = Date.now();
    const series = Array.from({ length: 60 }, (_, i) => ({
      ts: t0 + i * 100,
      tet: 1120,
      vibration: 1.0,
      bladeStress: 430,
      throttle: 82,
    }));
    const hits = detectPrecursors(series, 10);
    expect(hits.find((h) => h.key === 'trend:vibration')).toBeDefined();
  });

  it('returns nothing for a steady nominal window', () => {
    const t0 = Date.now();
    const series = Array.from({ length: 60 }, (_, i) => ({
      ts: t0 + i * 100,
      tet: 1120 + Math.sin(i) * 2,
      vibration: 0.4,
      bladeStress: 420,
      throttle: 82,
    }));
    expect(detectPrecursors(series, 10)).toHaveLength(0);
  });

  it('ignores throttle-driven regime changes (climb)', () => {
    const t0 = Date.now();
    const series = Array.from({ length: 60 }, (_, i) => ({
      ts: t0 + i * 100,
      // physically consistent with the envelope: TET/PLA ~2.24, stress/PLA ~1.68
      tet: 1080 + i * 1.6,
      vibration: 0.42 + i * 0.001,
      bladeStress: 420 + i * 1.2,
      throttle: 62 + i * 0.75,
    }));
    expect(detectPrecursors(series, 10)).toHaveLength(0);
  });
});

describe('linSlope', () => {
  it('computes a least-squares slope', () => {
    expect(linSlope([0, 1, 2, 3, 4])).toBeCloseTo(1);
    expect(linSlope([4, 3, 2, 1, 0])).toBeCloseTo(-1);
  });
});