import { create } from 'zustand';
import type { AIDiagnosticReport, AiEngine } from '../lib/types';
import type { OnDevicePrediction } from '../lib/aiInference';

interface DiagnosticsState {
  report: AIDiagnosticReport | null;
  engine: AiEngine | null;
  aiAvailable: boolean;
  updatedAt: number | null;
  running: boolean;
  error: string | null;
  /** live output of the on-device trained model (runs every diagnostic tick) */
  onDevice: (OnDevicePrediction & { at: number }) | null;
  setReport: (report: AIDiagnosticReport, engine: AiEngine) => void;
  setRunning: (b: boolean) => void;
  setError: (e: string | null) => void;
  setOnDevice: (p: OnDevicePrediction) => void;
  clear: () => void;
}

export const useDiagnosticsStore = create<DiagnosticsState>()((set) => ({
  report: null,
  engine: null,
  aiAvailable: false,
  updatedAt: null,
  running: false,
  error: null,
  onDevice: null,

  setReport: (report, engine) =>
    // aiAvailable = the /api/diagnose pipeline is up and returning valid
    // reports (gemini OR the rule-based fallback). `engine` records which.
    set({ report, engine, aiAvailable: true, updatedAt: Date.now(), error: null }),

  setRunning: (running) => set({ running }),

  setError: (error) => set({ error }),

  setOnDevice: (p) => set({ onDevice: { ...p, at: Date.now() } }),

  clear: () => set({ report: null, engine: null, aiAvailable: false, updatedAt: null, error: null, onDevice: null }),
}));