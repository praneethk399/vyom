import type { Severity } from './types';

export const ACCENT = '#22d3ee';
export const MUTED = '#70818c';

export const SEVERITY_COLOR: Record<Severity, string> = {
  nominal: '#2dd4bf',
  caution: '#fbbf24',
  warning: '#f59e0b',
  critical: '#ef4444',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  nominal: 'NOMINAL',
  caution: 'CAUTION',
  warning: 'WARNING',
  critical: 'CRITICAL',
};

export interface ColorStop {
  pos: number;
  color: string;
}

/** Thermal overlay — thermal-camera "ironbow" ramp: dark navy -> violet ->
 * magenta -> red -> orange -> hot amber. Avoids the muddy green mid-point of
 * cyan->amber RGB lerps and keeps cold parts dark so geometry reads. */
export const THERMAL_STOPS: ColorStop[] = [
  { pos: 0, color: '#0b1026' },
  { pos: 0.25, color: '#3b1f6e' },
  { pos: 0.45, color: '#8b2f8f' },
  { pos: 0.65, color: '#d93a63' },
  { pos: 0.82, color: '#f4713b' },
  { pos: 1, color: '#ffd166' },
];

/** Stress overlay — deep teal -> teal -> amber -> red (driven by bladeStress) */
export const STRESS_STOPS: ColorStop[] = [
  { pos: 0, color: '#134e4a' },
  { pos: 0.45, color: '#2dd4bf' },
  { pos: 0.75, color: '#fbbf24' },
  { pos: 1, color: '#ef4444' },
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function gradientColor(stops: ColorStop[], t: number): string {
  const x = Math.max(0, Math.min(1, t));
  if (x <= stops[0].pos) return stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i].pos) {
      const a = stops[i - 1];
      const b = stops[i];
      const f = (x - a.pos) / (b.pos - a.pos);
      const ca = hexToRgb(a.color);
      const cb = hexToRgb(b.color);
      const r = Math.round(ca[0] + (cb[0] - ca[0]) * f);
      const g = Math.round(ca[1] + (cb[1] - ca[1]) * f);
      const bl = Math.round(ca[2] + (cb[2] - ca[2]) * f);
      return `rgb(${r},${g},${bl})`;
    }
  }
  return stops[stops.length - 1].color;
}