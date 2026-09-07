import { create } from 'zustand';
import type { OverlayMode, Severity, Subsystem } from '../lib/types';

export type AlertIntensity = 'FULL' | 'REDUCED' | 'SILENT';
export type ThemeMode = 'dark' | 'light';
export type RenderMode = 'shaded' | 'wireframe';

export interface ToastItem {
  id: string;
  severity: Severity;
  title: string;
  message: string;
}

interface UiState {
  overlay: OverlayMode;
  activeSubsystem: Subsystem | null;
  plume: boolean;
  renderMode: RenderMode;
  theme: ThemeMode;
  alertIntensity: AlertIntensity;
  toasts: ToastItem[];
  vignette: { id: number; ts: number } | null;
  pulse: { id: number; ts: number } | null;
  setOverlay: (o: OverlayMode) => void;
  setActiveSubsystem: (s: Subsystem | null) => void;
  togglePlume: () => void;
  setRenderMode: (m: RenderMode) => void;
  setTheme: (t: ThemeMode) => void;
  cycleIntensity: () => void;
  setIntensity: (i: AlertIntensity) => void;
  pushToast: (t: ToastItem) => void;
  dismissToast: (id: string) => void;
  flashVignette: () => void;
  flashPulse: () => void;
}

const INTENSITY_ORDER: AlertIntensity[] = ['FULL', 'REDUCED', 'SILENT'];

function readTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('vyom.theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* ignore */
  }
  return 'dark';
}

// Monotonic flash ids — Date.now() collides when a single batch fires two
// flashes in the same millisecond (two criticals in one evaluateFrame batch),
// which React flags as duplicate keys.
let flashSeq = 0;

export const useUiStore = create<UiState>()((set, get) => ({
  overlay: 'thermal',
  activeSubsystem: null,
  plume: true,
  renderMode: 'shaded',
  theme: readTheme(),
  alertIntensity: 'FULL',
  toasts: [],
  vignette: null,
  pulse: null,

  setOverlay: (overlay) => set({ overlay }),

  setActiveSubsystem: (activeSubsystem) => set({ activeSubsystem }),

  togglePlume: () => set((s) => ({ plume: !s.plume })),

  setRenderMode: (renderMode) => set({ renderMode }),

  setTheme: (theme) => {
    try {
      localStorage.setItem('vyom.theme', theme);
    } catch {
      /* ignore */
    }
    set({ theme });
  },

  cycleIntensity: () => {
    const next = INTENSITY_ORDER[(INTENSITY_ORDER.indexOf(get().alertIntensity) + 1) % INTENSITY_ORDER.length];
    set({ alertIntensity: next });
  },

  setIntensity: (alertIntensity) => set({ alertIntensity }),

  pushToast: (t) => {
    set((s) => ({ toasts: [...s.toasts, t].slice(-4) }));
    setTimeout(() => get().dismissToast(t.id), 4500);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  flashVignette: () => set({ vignette: { id: ++flashSeq, ts: Date.now() } }),

  flashPulse: () => set({ pulse: { id: ++flashSeq, ts: Date.now() } }),
}));