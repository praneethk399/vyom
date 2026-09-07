import { create } from 'zustand';
import type { FlightDatasetMeta, MissionLogEntry, MissionLogType, Severity } from '../lib/types';

const LOG_MAX = 60;

interface MissionState {
  datasets: FlightDatasetMeta[];
  currentMissionId: string | null;
  log: MissionLogEntry[];
  datasetsError: boolean;
  setDatasets: (list: FlightDatasetMeta[]) => void;
  fetchDatasets: () => Promise<void>;
  selectDataset: (id: string) => void;
  addLog: (type: MissionLogType, message: string, severity?: Severity) => void;
  clearLog: () => void;
}

let logSeq = 0;

export const useMissionStore = create<MissionState>()((set, get) => ({
  datasets: [],
  currentMissionId: null,
  log: [],
  datasetsError: false,

  setDatasets: (datasets) => set({ datasets, datasetsError: false }),

  fetchDatasets: async () => {
    try {
      const res = await fetch('/api/datasets');
      if (!res.ok) throw new Error(`datasets ${res.status}`);
      const list = (await res.json()) as FlightDatasetMeta[];
      get().setDatasets(list);
    } catch {
      set({ datasetsError: true });
    }
  },

  selectDataset: (currentMissionId) => set({ currentMissionId }),

  addLog: (type, message, severity = 'nominal') =>
    set((s) => {
      const entry: MissionLogEntry = {
        id: `log:${Date.now()}:${logSeq++}`,
        ts: Date.now(),
        type,
        message,
        severity,
      };
      return { log: [entry, ...s.log].slice(0, LOG_MAX) };
    }),

  clearLog: () => set({ log: [] }),
}));