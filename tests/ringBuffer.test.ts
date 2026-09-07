import { describe, expect, it } from 'vitest';
import { pushRing, sampleWindow, windowSeries } from '../src/features/telemetry/ringBuffer';
import { makeFrame } from './helpers';

describe('pushRing', () => {
  it('caps the ring at max entries, keeping the newest', () => {
    let ring = [];
    for (let i = 0; i < 10; i++) ring = pushRing(ring, makeFrame({ n2Rpm: 14000 + i }, i * 100), 5);
    expect(ring).toHaveLength(5);
    expect(ring[0].telemetry.n2Rpm).toBe(14005);
    expect(ring[4].telemetry.n2Rpm).toBe(14009);
  });
});

describe('sampleWindow', () => {
  it('subsamples evenly when over the max points', () => {
    const ring = Array.from({ length: 100 }, (_, i) => makeFrame({}, i * 100));
    const out = sampleWindow(ring, 10);
    expect(out).toHaveLength(10);
    expect(out[0].ts).toBe(ring[0].ts);
    expect(out[9].ts).toBe(ring[99].ts);
  });

  it('returns the ring unchanged when within max points', () => {
    const ring = Array.from({ length: 5 }, (_, i) => makeFrame({}, i * 100));
    expect(sampleWindow(ring, 10)).toHaveLength(5);
  });
});

describe('windowSeries', () => {
  it('maps frames to {t, v} relative to the window start', () => {
    const ring = Array.from({ length: 3 }, (_, i) => makeFrame({ tet: 1100 + i }, i * 100));
    const s = windowSeries(ring, 'tet');
    expect(s).toEqual([
      { t: 0, v: 1100 },
      { t: 0.1, v: 1101 },
      { t: 0.2, v: 1102 },
    ]);
  });
});