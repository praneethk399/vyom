import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { TextEffect } from '../components/motion-primitives/text-effect';
import { TextShimmer } from '../components/motion-primitives/text-shimmer';
import { BorderTrail } from '../components/motion-primitives/border-trail';
import { useTelemetryStore } from '../state/telemetryStore';
import { fmt2, fmtClock } from '../lib/format';
import { getSession, setSession } from '../lib/session';

const DEMO_KEY = 'GAS418S-ALPHA-Q';

const BOOT_LINES = [
  'VYOM CORE v2.4.1 — GAS418S TWIN LINK INIT',
  'TELEMETRY BUS ............. ONLINE',
  'T–s CYCLE MODEL ............ CALIBRATED',
  'AI ANALYSIS CORE ........... STANDBY',
  'ACCESS CONTROL ............. ARMED',
];

export function Access() {
  const navigate = useNavigate();
  const [callsign, setCallsign] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [revealed, setRevealed] = useState(0);
  const [rejected, setRejected] = useState(false);
  const [granted, setGranted] = useState(false);
  const frame = useTelemetryStore((s) => s.frame);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (getSession()) {
      navigate('/command', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (revealed >= BOOT_LINES.length) return;
    const id = window.setTimeout(() => setRevealed((r) => r + 1), 380);
    return () => window.clearTimeout(id);
  }, [revealed]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const booting = revealed < BOOT_LINES.length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (booting || callsign.trim().length < 3) return;
    if (accessKey.trim().toUpperCase() !== DEMO_KEY) {
      setRejected(true);
      return;
    }
    setSession(callsign.trim());
    setGranted(true);
    window.setTimeout(() => navigate('/command', { replace: true }), 850);
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden" style={{ background: 'var(--bg-deep)' }}>
      {/* Haikei-style ambient background */}
      <div className="grid-bg absolute inset-0 opacity-70" aria-hidden="true" />
      <svg className="absolute inset-0 h-full w-full opacity-50" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        <defs>
          <filter id="ambient-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="70" />
          </filter>
        </defs>
        <g filter="url(#ambient-blur)">
          <ellipse cx="14%" cy="26%" rx="30%" ry="24%" fill="rgba(34,211,238,0.16)" />
          <ellipse cx="86%" cy="72%" rx="28%" ry="30%" fill="rgba(245,158,11,0.10)" />
          <ellipse cx="62%" cy="8%" rx="22%" ry="16%" fill="rgba(239,68,68,0.08)" />
          <ellipse cx="32%" cy="86%" rx="26%" ry="20%" fill="rgba(45,212,191,0.12)" />
        </g>
      </svg>

      {/* corner live telemetry ticker */}
      <div className="absolute bottom-4 left-4 flex flex-col gap-0.5">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted">
          <span className="blink text-accent">●</span> LIVE SAMPLE — GAS418S
        </span>
        <span className="num text-sm text-accent">
          EGT {frame ? `${fmt2(frame.tet)} K` : '—'} · {frame ? frame.n2Rpm.toLocaleString() : '—'} rpm
        </span>
      </div>
      <div className="absolute bottom-4 right-4 num text-[10px] text-muted">{fmtClock(now)}</div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4">
        {/* boot readout */}
        <div className="surface mb-8 w-full max-w-md p-4" style={{ fontFamily: 'var(--font-mono)' }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="eyebrow text-accent">VYOM CORE v2.4.1</span>
            <span className={`text-[9px] font-bold uppercase tracking-widest ${booting ? 'text-caution' : 'text-nominal'}`}>
              {booting ? 'BOOTING' : 'READY'}
            </span>
          </div>
          {BOOT_LINES.slice(0, revealed).map((l) => (
            <p key={l} className="text-[11px] leading-6 text-muted">
              <span className="text-accent">▸</span>{' '}
              <TextEffect
                as="span"
                per="word"
                preset="fade-in-blur"
                speedReveal={3}
                speedSegment={2.5}
                className="inline"
              >
                {l}
              </TextEffect>
            </p>
          ))}
          {booting && <p className="text-[11px] leading-6 text-accent"><span className="blink">▌</span></p>}
        </div>

        {/* access panel */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="bevel w-full max-w-md p-px"
          style={{ background: 'var(--line)' }}
        >
          <div className="bevel-in bg-[color:var(--panel)] p-6">
            <h1 style={{ fontFamily: 'var(--font-display)' }}>
              <TextShimmer
                as="span"
                duration={3.5}
                className="text-4xl font-bold tracking-[0.3em] [--base-color:#30e07e] [--base-gradient-color:#d6ffe8]"
              >
                VYOM
              </TextShimmer>
            </h1>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">
              AI-Enabled Digital Twin · Flygas GAS418S · Archer-BH
            </p>

            <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="eyebrow">CALLSIGN</span>
                <input
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value.toUpperCase())}
                  autoComplete="username"
                  className="num border bg-[color:var(--bg-deep)] px-2.5 py-2 text-sm uppercase outline-none placeholder:uppercase placeholder:text-muted/60"
                  style={{ borderColor: 'var(--line)' }}
                  placeholder="ALPHA-Q"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow">ACCESS KEY</span>
                <input
                  type="password"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  className="num border bg-[color:var(--bg-deep)] px-2.5 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--line)' }}
                  placeholder="••••••••••••••••"
                />
              </label>

              {rejected && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-critical">ACCESS KEY REJECTED — RETRY</p>
              )}

              <div className="relative mt-1">
                <BorderTrail
                  style={{ background: 'var(--accent)' }}
                  size={42}
                  transition={{ repeat: Infinity, duration: 3.2, ease: 'linear' }}
                />
                <button
                  type="submit"
                  disabled={booting || callsign.trim().length < 3}
                  className="w-full border border-[var(--accent)] bg-accent-soft px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.24em] text-accent transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Authenticate.
                </button>
              </div>
            </form>

            <p className="mt-4 text-[9px] uppercase tracking-widest text-muted">
              DEMO ACCESS KEY: <span className="text-accent">{DEMO_KEY}</span> · SIH 2026 · PS 26054 · TEAM ALPHA Q
            </p>
          </div>
        </motion.div>
      </div>

      {/* HUD-collapse wipe on successful login */}
      {granted && (
        <motion.div
          className="fixed inset-0 z-[60]"
          style={{ background: 'var(--bg)' }}
          initial={{ clipPath: 'inset(0 0 100% 0)' }}
          animate={{ clipPath: 'inset(0 0 0% 0)' }}
          transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
        >
          <motion.div
            className="flex h-full items-center justify-center"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, duration: 0.4 }}
          >
            <span className="text-lg font-bold uppercase tracking-[0.3em] text-accent" style={{ fontFamily: 'var(--font-display)' }}>
              ACCESS GRANTED — VYOM CORE ONLINE
            </span>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}