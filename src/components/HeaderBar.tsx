import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTelemetryStore } from '../state/telemetryStore';
import { useUiStore } from '../state/uiStore';
import { fmtClock } from '../lib/format';
import { getSession } from '../lib/session';
import { ThemeSwitch } from './ThemeSwitch';
import type { EngineMode } from '../lib/types';

const NAV = [
  { to: '/command', label: 'COMMAND' },
  { to: '/sensor', label: 'SENSOR TWIN' },
  { to: '/diagnostics', label: 'AI DIAGNOSTICS' },
  { to: '/maintenance', label: 'MAINTENANCE' },
];

const INTENSITY_LABEL = { FULL: 'ALERT: FULL', REDUCED: 'ALERT: REDUCED', SILENT: 'ALERT: SILENT' } as const;

export function HeaderBar() {
  const navigate = useNavigate();
  const mode = useTelemetryStore((s) => s.mode);
  const setMode = useTelemetryStore((s) => s.setMode);
  const linkOk = useTelemetryStore((s) => s.linkOk);
  const replayPlaying = useTelemetryStore((s) => s.replayPlaying);
  const datasetMeta = useTelemetryStore((s) => s.datasetMeta);
  const sessionAt = getSession()?.at ?? 0;
  const alertIntensity = useUiStore((s) => s.alertIntensity);
  const cycleIntensity = useUiStore((s) => s.cycleIntensity);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const mission = mode === 'DATASET_REPLAY' ? (datasetMeta?.name ?? '—') : 'LIVE MISSION · ARCHER-BH';
  // T+ = time since session start (clock skew-safe vs frame timestamps)
  const age = sessionAt > 0 ? Math.max(0, Math.floor((now - sessionAt) / 1000)) : 0;

  return (
    <header className="app-header hud-panel sticky top-0 z-30 flex h-12 items-center gap-3 px-3" style={{ background: 'var(--bg)' }}>
      <NavLink to="/command" className="flex items-baseline gap-1.5" aria-label="VYOM home">
        <span className="glow-accent text-lg font-bold tracking-[0.28em] text-accent" style={{ fontFamily: 'var(--font-display)' }}>
          VYOM
        </span>
        <span className="hidden text-[9px] font-semibold tracking-[0.2em] text-muted sm:inline">GAS418S · TWIN OS</span>
      </NavLink>

      <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Primary">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `whitespace-nowrap border-b-2 px-2 py-3 text-[10px] font-bold tracking-[0.16em] transition-colors ${
                isActive
                  ? 'glow-soft border-[var(--accent)] text-accent'
                  : 'border-transparent text-muted hover:border-[var(--line-strong)] hover:text-[var(--text)]'
              }`
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <div className="flex items-center" role="group" aria-label="Engine mode">
          {(['LIVE_SIM', 'DATASET_REPLAY'] as EngineMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`hud-chip border px-2.5 py-1 text-[9px] font-bold tracking-[0.14em] transition-colors ${
                mode === m
                  ? 'border-[var(--accent)] bg-accent-soft text-accent glow-soft'
                  : 'border-[var(--line)] text-muted hover:text-[var(--text)]'
              } ${m === 'LIVE_SIM' ? 'rounded-l' : 'rounded-r border-l-0'}`}
              aria-pressed={mode === m}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="hidden min-w-0 items-center gap-2 xl:flex">
          <span className="max-w-56 truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">{mission}</span>
          <span className={`inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.16em] ${linkOk ? 'text-nominal' : 'text-critical'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${linkOk ? 'blink' : ''}`} style={{ background: linkOk ? 'var(--nominal)' : 'var(--critical)' }} />
            {linkOk ? (mode === 'DATASET_REPLAY' && replayPlaying ? 'REPLAYING' : 'LINKED') : 'LINK LOST'}
          </span>
        </div>

        <span className="num hidden text-[9px] text-muted md:inline">T+{age}s</span>

        <button
          type="button"
          onClick={cycleIntensity}
          className="hidden border px-2 py-1 text-[9px] font-bold tracking-[0.14em] text-muted hover:text-accent sm:inline"
          title="Alert intensity (Full / Reduced / Silent)"
        >
          {INTENSITY_LABEL[alertIntensity]}
        </button>

        <ThemeSwitch />
        <span className="num hidden text-[9px] text-muted md:inline">{fmtClock(now)}</span>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.removeItem('vyom.session');
            } catch {
              /* ignore */
            }
            navigate('/');
          }}
          className="border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted hover:text-critical"
          aria-label="Sign out"
        >
          EXIT
        </button>
      </div>
    </header>
  );
}