import { useEffect, useRef } from 'react';
import { useTelemetryStore } from '../../state/telemetryStore';
import { useAlertStore } from '../../state/alertStore';
import { useMissionStore } from '../../state/missionStore';
import { LiveSimulator } from './liveSim';
import { fetchDataset, fetchDatasetList } from './datasetReplay';
import { evaluateFrame } from '../../lib/thresholds';
import type { EngineMode, EngineTelemetry, MissionLogType, TelemetrySource } from '../../lib/types';

/**
 * The global telemetry engine. Runs the client-side LIVE_SIM generator or
 * steps the DATASET_REPLAY at its sampling rate, and evaluates every frame
 * against the deterministic ACTIVE_LIMIT table (zero latency, no AI).
 */
export function useTelemetryEngine(): void {
  const mode = useTelemetryStore((s) => s.mode);
  const simRef = useRef<LiveSimulator | null>(null);
  if (!simRef.current) simRef.current = new LiveSimulator();

  // LIVE_SIM loop — 10 Hz procedural frames, fault-aware
  useEffect(() => {
    if (mode !== 'LIVE_SIM') return;
    const id = window.setInterval(() => {
      const sim = simRef.current;
      if (!sim) return;
      sim.setFault(useTelemetryStore.getState().fault);
      const telemetry = sim.advance(0.1);
      ingestFrame(telemetry, 'LIVE_SIM');
    }, 100);
    return () => window.clearInterval(id);
  }, [mode]);

  // DATASET_REPLAY loop — step frames at the dataset sampling rate
  useEffect(() => {
    if (mode !== 'DATASET_REPLAY') return;
    const st = useTelemetryStore.getState();
    if (!st.datasetMeta) {
      st.setDatasetLoading(true);
      (async () => {
        try {
          const list = await fetchDatasetList();
          useMissionStore.getState().setDatasets(list);
          const first = list[0];
          if (!first) throw new Error('no datasets');
          const ds = await fetchDataset(first.id);
          useTelemetryStore.getState().loadDataset(ds);
          useTelemetryStore.setState({ linkOk: true });
          systemEvent('DATASET', `DATASET LOADED — ${ds.name}`, 'nominal');
        } catch {
          useTelemetryStore.setState({ linkOk: false });
          systemEvent('LINK', 'LINK LOST — DATASET LIBRARY UNREACHABLE', 'caution');
        } finally {
          useTelemetryStore.setState({ datasetLoading: false });
        }
      })();
    }

    let acc = 0;
    const id = window.setInterval(() => {
      const s = useTelemetryStore.getState();
      const period = 1000 / (s.datasetMeta?.samplingRateHz ?? 10);
      acc += 100;
      if (acc < period) return;
      acc -= period;
      if (!s.replayPlaying || s.frames.length === 0) return;
      if (s.replayIndex >= s.frames.length - 1) {
        s.setPlaying(false);
        systemEvent('DATASET', `DATASET COMPLETE — ${s.datasetMeta?.name ?? ''}`, 'nominal');
        return;
      }
      const next = s.frames[s.replayIndex + 1];
      const { alerts, nextLimitState } = evaluateFrame(next, s.limitState);
      s.pushFrame(next, 'DATASET_REPLAY');
      s.setReplayIndex(s.replayIndex + 1);
      if (alerts.length > 0) useAlertStore.getState().pushAlerts(alerts);
      useTelemetryStore.setState({ limitState: nextLimitState });
    }, 100);
    return () => window.clearInterval(id);
  }, [mode]);

  // mode-switch SYSTEM_ADVISORY (skips the initial mount — StrictMode-safe) +
  // ring reset so trend windows never mix the two telemetry sources
  const prevMode = useRef<EngineMode | null>(null);
  useEffect(() => {
    if (prevMode.current !== null && prevMode.current !== mode) {
      systemEvent('MODE', `MODE → ${mode}`, 'nominal');
      useTelemetryStore.getState().resetStream();
    }
    prevMode.current = mode;
  }, [mode]);
}

export function ingestFrame(telemetry: EngineTelemetry, source: TelemetrySource): void {
  const s = useTelemetryStore.getState();
  const { alerts, nextLimitState } = evaluateFrame(telemetry, s.limitState);
  s.pushFrame(telemetry, source);
  if (alerts.length > 0) useAlertStore.getState().pushAlerts(alerts);
  useTelemetryStore.setState({ limitState: nextLimitState });
}

export function systemEvent(type: MissionLogType, message: string, severity: 'nominal' | 'caution' | 'warning' | 'critical' = 'nominal'): void {
  useAlertStore.getState().pushAlert({
    severity,
    category: 'SYSTEM_ADVISORY',
    title: type,
    message,
    source: 'system',
  });
  useMissionStore.getState().addLog(type, message, severity);
}