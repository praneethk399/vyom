export function fmt(v: number, digits = 0): string {
  return v.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmt2(v: number): string {
  return fmt(v, 2);
}

export function fmtK(v: number): string {
  return `${fmt(v, 0)} K`;
}

export function fmtRpm(v: number): string {
  return `${fmt(v, 0)} rpm`;
}

export function fmtKn(v: number): string {
  return `${fmt(v, 2)} kN`;
}

export function fmtPsi(v: number): string {
  return `${fmt(v, 0)} psi`;
}

export function fmtLh(v: number): string {
  return `${fmt(v, 1)} L/h`;
}

export function fmtV(v: number): string {
  return `${fmt(v, 2)} V`;
}

export function fmtG(v: number): string {
  return `${fmt(v, 2)} g`;
}

export function fmtPct(v: number): string {
  return `${fmt(v, 1)}%`;
}

export function fmtHrs(v: number): string {
  return `${fmt(v, 0)} h`;
}

export function fmtClock(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

export function fmtAgo(ts: number, now = Date.now()): string {
  const d = now - ts;
  if (d < 0) return '0 ms';
  if (d < 1000) return `${Math.round(d)} ms`;
  return `${(d / 1000).toFixed(1)} s`;
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}