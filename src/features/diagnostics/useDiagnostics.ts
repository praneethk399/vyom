import { useEffect } from 'react';
import { useTelemetryStore } from '../../state/telemetryStore';
import { useAlertStore } from '../../state/alertStore';
import { useDiagnosticsStore } from '../../state/diagnosticsStore';
import { sampleWindow } from '../telemetry/ringBuffer';
import { detectPrecursors } from '../../lib/thresholds';
import { predict, isFailurePredicted, slopeFeatures, modelMeta } from '../../lib/aiInference';
import { authHeaders } from '../../lib/supabase';
import type { AIDiagnosticReport, DiagnoseResponse, Subsystem } from '../../lib/types';

export const DIAGNOSE_INTERVAL_MS = 3000;
const CONFIDENCE_BAR = 0.7;

function raiseAiPrecursors(report: AIDiagnosticReport): void {
  const alerts = useAlertStore.getState();
  const now = Date.now();
  for (const pf of report.probableFailures) {
    if (pf.status === 'NOMINAL') continue;
    if (pf.probability < CONFIDENCE_BAR) continue;
    const key = `ai:${pf.id}:${Math.round(pf.probability * 10)}`;
    if (alerts.isPrecursorFresh(key, now)) continue;
    alerts.markPrecursor(key, now);
    alerts.pushAlert({
      severity: pf.status === 'IMMINENT_BREACH' ? 'warning' : 'caution',
      category: 'PREDICTIVE_PRECURSOR',
      title: `${pf.subsystem} — ${pf.failureMode}`,
      message: `Probability ${(pf.probability * 100).toFixed(0)}% · TTF ${pf.timeToFailureHours ?? '—'} h`,
      parameter: pf.subsystem,
      source: 'ai',
    });
  }
}

function raiseDeterministicPrecursors(): void {
  const s = useTelemetryStore.getState();
  if (s.ring.length < 20) return;
  const window = s.ring.slice(-60);
  const series = window.map((f) => ({
    ts: f.ts,
    tet: f.telemetry.tet,
    vibration: f.telemetry.vibration,
    bladeStress: f.telemetry.bladeStress,
    throttle: f.telemetry.throttle,
  }));
  const hz = s.mode === 'DATASET_REPLAY' ? (s.datasetMeta?.samplingRateHz ?? 10) : 10;
  const hits = detectPrecursors(series, hz);
  const alerts = useAlertStore.getState();
  const now = Date.now();
  for (const hit of hits) {
    if (alerts.isPrecursorFresh(hit.key, now)) continue;
    alerts.markPrecursor(hit.key, now);
    alerts.pushAlert({
      severity: hit.severity,
      category: 'PREDICTIVE_PRECURSOR',
      title: hit.title,
      message: hit.message,
      parameter: hit.parameter,
      source: 'threshold',
    });
  }
}

/**
 * On-device trained-model pass — runs EVERY tick (no network). The models
 * were trained offline on the real UAV telemetry corpora (96.5% val acc);
 * failures predicted above the bar raise PREDICTIVE_PRECURSOR alerts and
 * update the diagnostics store even when /api/diagnose is unreachable.
 */
function runOnDeviceModel(): void {
  const s = useTelemetryStore.getState();
  if (s.ring.length < 5) return;
  const cur = s.ring[s.ring.length - 1];
  const prev = s.ring[s.ring.length - 2] ?? null;
  const dt = prev ? Math.max(0.05, (cur.ts - prev.ts) / 1000) : 1;
  // slope features over the trainer's ~10 s reference lag (full-rate window;
  // fall back to the single-frame diff inside predict() when replaying at 1 Hz)
  const hz = s.mode === 'DATASET_REPLAY' ? (s.datasetMeta?.samplingRateHz ?? 10) : 10;
  const span = Math.max(1, Math.round(10 * hz));
  const start = s.ring[Math.max(0, s.ring.length - 1 - span)];
  const windowTel = [start.telemetry, cur.telemetry];
  const slopes = slopeFeatures(
    windowTel,
    (cur.ts - start.ts) / 1000,
  );
  const pred = predict(cur.telemetry, prev?.telemetry ?? null, dt, slopes);
  useDiagnosticsStore.getState().setOnDevice(pred);

  if (!isFailurePredicted(pred, 0.6)) return;
  const alerts = useAlertStore.getState();
  const now = Date.now();
  const key = `onDevice:${pred.topSubsystem}`;
  if (alerts.isPrecursorFresh(key, now)) return;
  alerts.markPrecursor(key, now);
  alerts.pushAlert({
    severity: pred.topProbability >= 0.8 ? 'warning' : 'caution',
    category: 'PREDICTIVE_PRECURSOR',
    title: `AI MODEL — ${pred.topSubsystem.toUpperCase()} FAILURE SIGNATURE`,
    message: `Trained classifier ${(pred.topProbability * 100).toFixed(0)}% · RUL est ${Math.round(pred.rulHoursBlended)} h`,
    parameter: pred.topSubsystem as Subsystem,
    source: 'ai',
  });
}

/**
 * The AI analysis loop. Every 3-5 s the recent telemetry window is POSTed to
 * /api/diagnose; the returned report populates the diagnostics store and
 * raises PREDICTIVE_PRECURSOR alerts for failures above the confidence bar.
 * If the call errors or rate-limits, the deterministic threshold layer AND
 * the on-device trained model continue untouched.
 *
 * Exported separately from the hook so tests can drive it headlessly (fake
 * timers + mocked fetch); useDiagnostics just mounts and unmounts it.
 * Returns a stop function.
 */
export function startDiagnosticsLoop(): () => void {
  void modelMeta; // loaded with the bundle; see aiInference.modelMeta
  // Overlap gate: a slow /api/diagnose response must never overwrite a
  // newer one. The on-device passes below run every tick regardless.
  let inFlight = false;
  const tick = async () => {
    raiseDeterministicPrecursors();
    runOnDeviceModel();
    if (inFlight) return;
    const s = useTelemetryStore.getState();
    if (s.ring.length < 10) return;
    inFlight = true;
    const store = useDiagnosticsStore.getState();
    store.setRunning(true);
    try {
      const res = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          window: sampleWindow(s.ring, 90).map((f) => ({ ts: f.ts, telemetry: f.telemetry })),
          fault: s.fault,
          mode: s.mode,
          dataset: s.datasetMeta?.name ?? null,
        }),
      });
      if (!res.ok) throw new Error(`diagnose ${res.status}`);
      const data = (await res.json()) as DiagnoseResponse;
      useDiagnosticsStore.getState().setReport(data.report, data.engine);
      raiseAiPrecursors(data.report);
    } catch (err) {
      useDiagnosticsStore.getState().setError(err instanceof Error ? err.message : 'diagnose failed');
    } finally {
      inFlight = false;
      useDiagnosticsStore.getState().setRunning(false);
    }
  };
  const id = setInterval(tick, DIAGNOSE_INTERVAL_MS);
  void tick();
  return () => clearInterval(id);
}

export function useDiagnostics(): void {
  useEffect(() => startDiagnosticsLoop(), []);
}
