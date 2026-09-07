import { describe, expect, it } from 'vitest';
import { LiveSimulator } from '../src/features/telemetry/liveSim';
import { LIMIT_RULES, RULE_BY_PARAM } from '../src/lib/thresholds';
import type { FaultClass, ThresholdParameter } from '../src/lib/types';

type Param = ThresholdParameter;

const CASES: { fault: FaultClass; param: Param; atStep: number }[] = [
  { fault: 'TET_RUNWAY', param: 'tet', atStep: 600 },
  { fault: 'VIBRATION_GROWTH', param: 'vibration', atStep: 600 },
  { fault: 'OIL_PRESSURE_LOSS', param: 'oilPressure', atStep: 600 },
  { fault: 'COMPRESSOR_STALL', param: 'pressureRatio', atStep: 600 },
  { fault: 'FUEL_FLOW_ANOMALY', param: 'fuelFlow', atStep: 600 },
  { fault: 'BATTERY_SAG', param: 'batteryVoltage', atStep: 600 },
];

describe('LiveSimulator fault injection (deterministic, seeded)', () => {
  it.each(CASES)('$fault pushes $param past its soft limit', ({ fault, param, atStep }) => {
    const sim = new LiveSimulator(20260);
    sim.setFault(fault);
    let frame = sim.advance(0.1);
    for (let i = 1; i < atStep; i++) frame = sim.advance(0.1);
    const rule = RULE_BY_PARAM.get(param);
    expect(rule).toBeDefined();
    const value = frame[param];
    if (rule!.direction === 'above') {
      expect(value).toBeGreaterThan(rule!.softLimit);
    } else {
      expect(value).toBeLessThan(rule!.softLimit);
    }
  });

  it('stays nominal under NORMAL', () => {
    const sim = new LiveSimulator(20260);
    sim.setFault('NORMAL');
    let frame = sim.advance(0.1);
    for (let i = 1; i < 600; i++) frame = sim.advance(0.1);
    for (const rule of LIMIT_RULES) {
      const v = frame[rule.parameter];
      if (rule.direction === 'above') expect(v).toBeLessThan(rule.softLimit);
      else expect(v).toBeGreaterThan(rule.softLimit);
    }
  });

  it('recovers toward nominal after a fault is cleared', () => {
    const sim = new LiveSimulator(20260);
    sim.setFault('TET_RUNWAY');
    for (let i = 0; i < 300; i++) sim.advance(0.1);
    sim.setFault('NORMAL');
    let frame = sim.advance(0.1);
    for (let i = 1; i < 900; i++) frame = sim.advance(0.1);
    expect(frame.tet).toBeLessThan(1180);
  });
});