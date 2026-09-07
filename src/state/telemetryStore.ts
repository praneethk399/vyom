import { create } from 'zustand';
import type {
  EngineTelemetry,
  EngineMode,
  FaultClass,
  FlightDataset,
  FlightDatasetMeta,
  TelemetryFrame,
  TelemetrySource,
} from '../lib/types';
import type { LimitState } from '../lib/thresholds';

export const RING_MAX = 600; // 60 s @ 10 Hz
export const SAMPLE_RATE_HZ = 10;

interface TelemetryState {
  mode: EngineMode;
  fault: FaultClass;
  datasetMeta: FlightDatasetMeta | null;
  frames: EngineTelemetry[];
  replayIndex: number;
  replayPlaying: boolean;
  datasetLoading: boolean;
  linkOk: boolean;
  frame: EngineTelemetry | null;
  frameTs: number;
  frameSeq: number;
  ring: TelemetryFrame[];
  limitState: LimitState;
  setMode: (mode: EngineMode) => void;
  setFault: (fault: FaultClass) => void;
  pushFrame: (telemetry: EngineTelemetry, source: TelemetrySource, ts?: number) => void;
  loadDataset: (ds: FlightDataset) => void;
  setReplayIndex: (i: number) => void;
  scrubTo: (i: number) => void;
  setPlaying: (p: boolean) => void;
  setDatasetLoading: (b: boolean) => void;
  setLinkOk: (ok: boolean) => void;
  setLimitState: (s: LimitState) => void;
  resetStream: () => void;
  reset: () => void;
}

export const useTelemetryStore = create<TelemetryState>()((set, get) => ({
  mode: 'LIVE_SIM',
  fault: 'NORMAL',
  datasetMeta: null,
  frames: [],
  replayIndex: 0,
  replayPlaying: true,
  datasetLoading: false,
  linkOk: true,
  frame: null,
  frameTs: 0,
  frameSeq: 0,
  ring: [],
  limitState: {},

  setMode: (mode) => set({ mode }),

  setFault: (fault) => set({ fault }),

  pushFrame: (telemetry, source, ts = Date.now()) =>
    set((s) => {
      const id = s.frameSeq + 1;
      const f: TelemetryFrame = { id, ts, source, telemetry };
      const ring =
        s.ring.length >= RING_MAX ? [...s.ring.slice(s.ring.length - RING_MAX + 1), f] : [...s.ring, f];
      return { frame: telemetry, frameTs: ts, frameSeq: id, ring };
    }),

  loadDataset: (ds) => {
    // A dataset switch starts a fresh stream: clear ring + limitState so trend
    // windows never mix captures, and arm frame 0 in the ring so the first
    // chart sample matches the gauge (the replay loop pushes frames 1..n).
    set({
      datasetMeta: {
        id: ds.id,
        missionId: ds.missionId,
        name: ds.name,
        description: ds.description,
        conditions: ds.conditions,
        samplingRateHz: ds.samplingRateHz,
        durationSec: ds.durationSec,
        frameCount: ds.frames.length,
        startTime: ds.startTime,
        reliability: ds.reliability,
      },
      frames: ds.frames,
      replayIndex: 0,
      replayPlaying: true,
      limitState: {},
      frame: null,
      ring: [],
    });
    if (ds.frames.length > 0) get().pushFrame(ds.frames[0], 'DATASET_REPLAY');
  },

  setReplayIndex: (i) => set({ replayIndex: i }),

  scrubTo: (i) => {
    const s = get();
    const frames = s.frames;
    if (frames.length === 0) return;
    const idx = Math.max(0, Math.min(frames.length - 1, i));
    if (idx === s.replayIndex && s.frame) return;
    const telemetry = frames[idx];
    set({ replayIndex: idx });
    s.pushFrame(telemetry, 'DATASET_REPLAY');
  },

  setPlaying: (p) => set({ replayPlaying: p }),

  setDatasetLoading: (b) => set({ datasetLoading: b }),

  setLinkOk: (ok) => set({ linkOk: ok }),

  setLimitState: (limitState) => set({ limitState }),

  /** Clear the rolling window on source switches so trend windows never mix sources */
  resetStream: () => set({ ring: [], limitState: {} }),

  reset: () => set({ frame: null, frameTs: 0, ring: [], limitState: {} }),
}));