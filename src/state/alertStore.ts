import { create } from 'zustand';
import type { AlertNotification } from '../lib/types';

export const ALERT_MAX = 60;
const PRECURSOR_COOLDOWN_MS = 45_000;

type NewAlert = Omit<AlertNotification, 'acknowledged' | 'id' | 'ts'> & Partial<Pick<AlertNotification, 'id' | 'ts'>>;

let alertSeq = 0;

function materialize(a: NewAlert): AlertNotification {
  return {
    ...a,
    id: a.id ?? `alert:${Date.now()}:${alertSeq++}`,
    ts: a.ts ?? Date.now(),
    acknowledged: false,
  };
}

interface AlertState {
  alerts: AlertNotification[];
  lastPrecursorAt: Record<string, number>;
  pushAlert: (a: NewAlert) => void;
  pushAlerts: (items: NewAlert[]) => void;
  acknowledge: (id: string) => void;
  acknowledgeAll: () => void;
  clear: () => void;
  markPrecursor: (key: string, ts: number) => void;
  isPrecursorFresh: (key: string, now: number) => boolean;
}

export const useAlertStore = create<AlertState>()((set, get) => ({
  alerts: [],
  lastPrecursorAt: {},

  pushAlert: (a) =>
    set((s) => {
      const alert = materialize(a);
      const alerts = [alert, ...s.alerts].slice(0, ALERT_MAX);
      return { alerts };
    }),

  pushAlerts: (items) =>
    set((s) => {
      const fresh: AlertNotification[] = items.map(materialize);
      const alerts = [...fresh.reverse(), ...s.alerts].slice(0, ALERT_MAX);
      return { alerts };
    }),

  acknowledge: (id) =>
    set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)) })),

  acknowledgeAll: () => set((s) => ({ alerts: s.alerts.map((a) => ({ ...a, acknowledged: true })) })),

  clear: () => set({ alerts: [] }),

  markPrecursor: (key, ts) =>
    set((s) => ({ lastPrecursorAt: { ...s.lastPrecursorAt, [key]: ts } })),

  isPrecursorFresh: (key, now) => {
    const at = get().lastPrecursorAt[key];
    return at !== undefined && now - at < PRECURSOR_COOLDOWN_MS;
  },
}));