import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIAGNOSE_INTERVAL_MS, startDiagnosticsLoop } from '../src/features/diagnostics/useDiagnostics';
import { useTelemetryStore } from '../src/state/telemetryStore';
import { useDiagnosticsStore } from '../src/state/diagnosticsStore';
import type { AIDiagnosticReport, AiEngine, DiagnoseResponse } from '../src/lib/types';
import { makeFrame } from './helpers';

// Slow-response race fixture: pins the inFlight overlap guard in the
// diagnostics loop — while one /api/diagnose fetch is pending, no second
// fetch may start, so a stale (older) response can never overwrite a
// fresher one. Driven headlessly: fake timers + a controllable fetch mock.

function deferred(): { promise: Promise<Response>; resolve: (r: Response) => void } {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => (resolve = r));
  return { promise, resolve };
}

function makeReport(primaryRiskFactor: string): AIDiagnosticReport {
  const block = { summary: '', findings: [] };
  return {
    generatedAt: Date.now(),
    overallStatus: 'ACCEPTABLE',
    healthScore: 70,
    predictedRulHours: 800,
    confidenceScore: 0.9,
    primaryRiskFactor,
    thermodynamicAssessment: block,
    mechanicalStressAssessment: block,
    electricalAuxiliaryAssessment: block,
    rootCauseAnalysis: [],
    recommendedActions: [],
    probableFailures: [],
    drdoComplianceStatus: 'COMPLIANT',
    isAiGenerated: false,
  };
}

describe('diagnostics loop — slow-response race', () => {
  let stop: (() => void) | undefined;
  let calls: { resolve: (r: Response) => void }[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    fetchMock = vi.fn(() => {
      const d = deferred();
      calls.push(d);
      return d.promise;
    });
    vi.stubGlobal('fetch', fetchMock);
    // Seed a ring big enough for the fetch path (>= 10 frames) with nominal data
    const t0 = Date.now();
    useTelemetryStore.setState({ ring: Array.from({ length: 12 }, (_, i) => makeFrame({}, t0 + i * 100)) });
    useDiagnosticsStore.getState().clear();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const respond = (i: number, report: AIDiagnosticReport, engine: AiEngine = 'rule-based') =>
    calls[i].resolve({ ok: true, json: async () => ({ report, engine }) } as unknown as Response);

  const flush = () => vi.advanceTimersByTimeAsync(1);

  it('a pending slow response blocks new fetches, so the report is always the latest one', async () => {
    stop = startDiagnosticsLoop(); // initial tick -> request 0 issued, still pending
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useDiagnosticsStore.getState().running).toBe(true);

    // Older request 0 (slow, stale payload) still in flight: ticks must not overlap it
    await vi.advanceTimersByTimeAsync(2 * DIAGNOSE_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    respond(0, makeReport('STALE WINDOW'));
    await flush();
    expect(useDiagnosticsStore.getState().report).toMatchObject({ primaryRiskFactor: 'STALE WINDOW' });
    expect(useDiagnosticsStore.getState().running).toBe(false);

    // Only after it settles does the next tick fetch again — fresher response wins
    await vi.advanceTimersByTimeAsync(DIAGNOSE_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    respond(1, makeReport('FRESH WINDOW'), 'gemini');
    await flush();
    const s = useDiagnosticsStore.getState();
    expect(s.report).toMatchObject({ primaryRiskFactor: 'FRESH WINDOW' });
    expect(s.engine).toBe('gemini');
    expect(s.aiAvailable).toBe(true);
    expect(s.running).toBe(false);
  });

  it('a failed response records the error without wedging the loop', async () => {
    stop = startDiagnosticsLoop();
    calls[0].resolve({ ok: false, status: 503 } as Response);
    await flush();
    const s = useDiagnosticsStore.getState();
    expect(s.error).toBe('diagnose 503');
    expect(s.report).toBeNull();
    expect(s.running).toBe(false);

    await vi.advanceTimersByTimeAsync(DIAGNOSE_INTERVAL_MS); // next tick retries
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
