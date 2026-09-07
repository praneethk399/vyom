export interface Session {
  callsign: string;
  at: number;
}

const KEY = 'vyom.session';

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (typeof s.callsign !== 'string') return null;
    return s;
  } catch {
    return null;
  }
}

export function setSession(callsign: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ callsign, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}