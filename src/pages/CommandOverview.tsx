import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTelemetryStore } from '../state/telemetryStore';
import { useAlertStore } from '../state/alertStore';
import { useUiStore } from '../state/uiStore';
import { useDiagnosticsStore } from '../state/diagnosticsStore';
import { Panel } from '../components/Panel';
import { Reveal } from '../components/Reveal';
import { GaugeDial } from '../components/GaugeDial';
import { useThrottledRing } from '../features/telemetry/useThrottledRing';
import { TrendChart } from '../components/TrendChart';
import { StatusBadge } from '../components/StatusBadge';
import { CountUp } from '../components/CountUp';
import { BorderTrail } from '../components/motion-primitives/border-trail';
import { AlertFeed } from '../features/alerts/AlertFeed';
import { FailureModeCard } from '../features/failure-modes/FailureModeCard';
import { ScenarioSim } from '../features/mission/ScenarioSim';
import { DatasetPicker } from '../features/mission/DatasetPicker';
import { ScrubBar } from '../features/mission/ScrubBar';
import { EngineView } from '../three/EngineModel';
import { RULE_BY_PARAM, classifyValue, type ThresholdParameter } from '../lib/thresholds';
import { windowSeries } from '../features/telemetry/ringBuffer';
import { fmt, fmt2, fmtHrs, fmtK, fmtKn, fmtLh, fmtPsi, fmtRpm, fmtV } from '../lib/format';
import { SEVERITY_COLOR } from '../lib/palette';
import { SUBSYSTEMS } from '../lib/types';
import type { Severity } from '../lib/types';

const GAUGES: {
  key: ThresholdParameter | 'thrust';
  label: string;
  min: number;
  max: number;
  unit: string;
  format: (v: number) => string;
}[] = [
  { key: 'n2Rpm', label: 'N2 RPM', min: 9000, max: 15000, unit: 'RPM', format: (v) => fmtRpm(v) },
  { key: 'tet', label: 'TET', min: 950, max: 1400, unit: 'K', format: (v) => fmtK(v) },
  { key: 'thrust', label: 'THRUST', min: 40, max: 65, unit: 'kN', format: (v) => fmtKn(v) },
  { key: 'oilPressure', label: 'OIL PRESS', min: 30, max: 80, unit: 'PSI', format: (v) => fmtPsi(v) },
  { key: 'vibration', label: 'VIBRATION', min: 0, max: 3, unit: 'g RMS', format: (v) => fmt2(v) },
  { key: 'fuelFlow', label: 'FUEL FLOW', min: 20, max: 50, unit: 'L/h', format: (v) => fmtLh(v) },
  { key: 'batteryVoltage', label: 'BATT', min: 18, max: 30, unit: 'V', format: (v) => fmtV(v) },
];

const CHART_PARAMS: { key: 'tet' | 'n2Rpm' | 'thrust' | 'oilPressure' | 'vibration' | 'fuelFlow' | 'batteryVoltage'; label: string; unit: string; min: number; max: number }[] = [
  { key: 'n2Rpm', label: 'N2 RPM', unit: 'rpm', min: 9000, max: 15000 },
  { key: 'tet', label: 'TET', unit: 'K', min: 950, max: 1400 },
  { key: 'thrust', label: 'THRUST', unit: 'kN', min: 40, max: 65 },
  { key: 'oilPressure', label: 'OIL PRESS', unit: 'PSI', min: 0, max: 80 },
  { key: 'vibration', label: 'VIBRATION', unit: 'g', min: 0, max: 3 },
  { key: 'fuelFlow', label: 'FUEL FLOW', unit: 'L/h', min: 0, max: 50 },
  { key: 'batteryVoltage', label: 'BATT', unit: 'V', min: 18, max: 30 },
];

const CHART_FORMAT: Record<'tet' | 'n2Rpm' | 'thrust' | 'oilPressure' | 'vibration' | 'fuelFlow' | 'batteryVoltage', (v: number) => string> = {
  n2Rpm: (v) => fmt(v, 0),
  tet: (v) => fmt(v, 0),
  thrust: (v) => fmt(v, 2),
  oilPressure: (v) => fmt(v, 0),
  vibration: fmt2,
  fuelFlow: (v) => fmt(v, 1),
  batteryVoltage: fmt2,
};

export function CommandOverview() {
  const navigate = useNavigate();
  const mode = useTelemetryStore((s) => s.mode);
  const fault = useTelemetryStore((s) => s.fault);
  const frame = useTelemetryStore((s) => s.frame);
  const ring = useThrottledRing();
  const activeSubsystem = useUiStore((s) => s.activeSubsystem);
  const setActiveSubsystem = useUiStore((s) => s.setActiveSubsystem);
  const overlay = useUiStore((s) => s.overlay);
  const setOverlay = useUiStore((s) => s.setOverlay);
  const alerts = useAlertStore((s) => s.alerts);
  const report = useDiagnosticsStore((s) => s.report);
  const running = useDiagnosticsStore((s) => s.running);
  const aiOnline = running || report != null;

  const series = useMemo(() => {
    const out: Record<string, { t: number; v: number }[]> = {};
    for (const p of CHART_PARAMS) out[p.key] = windowSeries(ring, p.key);
    return out;
  }, [ring]);

  const gaugeSeverity = (key: ThresholdParameter | 'thrust', value: number): Severity => {
    if (key === 'thrust') return 'nominal';
    const rule = RULE_BY_PARAM.get(key);
    const sev = rule ? classifyValue(rule, value) : 'nominal';
    if (sev !== 'nominal') return sev;
    const now = Date.now();
    const rec = alerts.find(
      (a) => a.parameter === key && a.severity === 'caution' && !a.acknowledged && now - a.ts < 20_000,
    );
    return rec ? 'caution' : 'nominal';
  };

  const failures = report?.probableFailures ?? [];
  const activeFailure = activeSubsystem ? failures.find((f) => f.subsystem === activeSubsystem) : undefined;

  const gaugeDial = (g: (typeof GAUGES)[number]) => (
    <div key={g.key} className="swiper-item">
      <GaugeDial
        label={g.label}
        value={frame?.[g.key] ?? 0}
        min={g.min}
        max={g.max}
        unit={g.unit}
        format={g.format}
        severity={gaugeSeverity(g.key, frame?.[g.key] ?? 0)}
      />
    </div>
  );

  const health = frame?.healthIndex ?? 0;
  const rul = frame?.rulHours ?? 0;
  const worstSeverity: Severity = alerts.some((a) => a.severity === 'critical' && !a.acknowledged)
    ? 'critical'
    : alerts.some((a) => a.severity === 'warning' && !a.acknowledged)
      ? 'warning'
      : alerts.some((a) => a.severity === 'caution' && !a.acknowledged)
        ? 'caution'
        : 'nominal';

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {/* subsystem chips — mobile only */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto lg:hidden" aria-label="Subsystems">
        {SUBSYSTEMS.map((sub) => {
          const f = failures.find((x) => x.subsystem === sub);
          const sev = f ? (f.status === 'IMMINENT_BREACH' ? 'critical' : f.status === 'PRECURSOR_ACTIVE' ? 'warning' : 'nominal') : 'nominal';
          return (
            <button
              key={sub}
              type="button"
              onClick={() => setActiveSubsystem(activeSubsystem === sub ? null : sub)}
              className={`swiper-item border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${
                activeSubsystem === sub ? 'border-[var(--accent)] bg-accent-soft text-accent' : 'border-[var(--line)] text-muted'
              }`}
            >
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: SEVERITY_COLOR[sev] }} />
              {sub}
            </button>
          );
        })}
      </div>

      <div className="grid flex-1 grid-cols-12 gap-3">
        {/* left rail */}
        <aside className="col-span-2 hidden min-h-0 flex-col gap-3 lg:flex">
          <Panel title="SUBSYSTEMS" className="min-h-0 flex-1">
            <div className="flex flex-col gap-1">
              {SUBSYSTEMS.map((sub) => {
                const f = failures.find((x) => x.subsystem === sub);
                const sev = f ? (f.status === 'IMMINENT_BREACH' ? 'critical' : f.status === 'PRECURSOR_ACTIVE' ? 'warning' : 'nominal') : 'nominal';
                return (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setActiveSubsystem(activeSubsystem === sub ? null : sub)}
                    className={`bd-l flex items-center gap-2 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      activeSubsystem === sub ? 'bg-accent-soft text-accent' : 'text-muted hover:text-[var(--text)]'
                    }`}
                    style={{ borderLeftColor: activeSubsystem === sub ? 'var(--accent)' : 'transparent' }}
                    aria-pressed={activeSubsystem === sub}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEVERITY_COLOR[sev] }} />
                    {sub}
                  </button>
                );
              })}
            </div>
          </Panel>
          <Panel title="OVERLAY MODE">
            <div className="grid grid-cols-2 gap-1.5">
              {(['thermal', 'stress'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOverlay(o)}
                  aria-pressed={overlay === o}
                  className={`border px-2 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] ${
                    overlay === o ? 'border-[var(--accent)] bg-accent-soft text-accent' : 'border-[var(--line)] text-muted'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </Panel>
        </aside>

        {/* center: 3D viewer + telemetry strip */}
        <section className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-7">
          <Reveal className="min-h-[300px] flex-1">
            <Panel
              title="GAS418S TWIN · ENGINE VIEWER"
              bodyClassName="p-0"
              className="h-full"
              right={
                <span className="flex items-center gap-2">
                  <span className="num text-[9px] text-muted">                      {overlay === 'thermal' ? `TET ${frame ? fmtK(frame.tet) : '—'}` : `BLADE STRESS ${frame ? `${frame.bladeStress} MPa` : '—'}`}
                  </span>
                  <StatusBadge severity={worstSeverity} label="Twin Link" pulse={worstSeverity !== 'nominal'} />
                </span>
              }
            >
              <div className="relative h-full min-h-[280px]">
                <EngineView />
                <BorderTrail
                  style={{ background: 'var(--accent)' }}
                  size={54}
                  transition={{ repeat: Infinity, duration: 7, ease: 'linear' }}
                />
              </div>
            </Panel>
          </Reveal>

          <Panel title="TELEMETRY STRIP" bodyClassName="px-2 py-2">
            <div className="no-scrollbar flex gap-2 overflow-x-auto lg:grid lg:grid-cols-7 lg:justify-items-center">
              {GAUGES.map(gaugeDial)}
            </div>
          </Panel>
        </section>

        {/* right rail */}
        <aside className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-3">
          {activeSubsystem && (
            <Panel title={`ACTIVE SUBSYSTEM — ${activeSubsystem}`} bodyClassName="p-2">
              {activeFailure ? (
                <FailureModeCard failure={activeFailure} compact />
              ) : (
                <p className="p-2 text-[10px] uppercase tracking-widest text-muted">NO PRECURSOR DETECTED — NOMINAL</p>
              )}
              <button
                type="button"
                onClick={() => setActiveSubsystem(null)}
                className="mt-1.5 w-full border border-[var(--line)] py-1 text-[8px] font-bold uppercase tracking-widest text-muted hover:text-accent"
              >
                CLEAR HIGHLIGHT
              </button>
            </Panel>
          )}

          <Panel title="HEALTH ANALYSIS">
            <div className="flex flex-col gap-2.5">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="eyebrow">OVERALL HEALTH</span>
                  <CountUp value={health} format={(v) => `${v.toFixed(1)}%`} className="text-sm font-bold text-accent" />
                </div>
                <div className="mt-1 h-1.5 w-full" style={{ background: 'var(--panel-3)' }}>
                  <div
                    className="h-full transition-[width] duration-300"
                    style={{ width: `${health}%`, background: health > 78 ? 'var(--nominal)' : health > 55 ? 'var(--monitor)' : 'var(--action)' }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="surface-2 p-2">
                  <span className="eyebrow">PREDICTED RUL</span>
                  <div className="mt-1">
                    <CountUp value={rul} format={fmtHrs} className="text-xl font-bold" />
                  </div>
                </div>
                <div className="surface-2 p-2">
                  <span className="eyebrow">MISSION STATUS</span>
                  <div className="mt-1">
                    <StatusBadge severity={fault === 'NORMAL' ? worstSeverity === 'nominal' ? 'nominal' : worstSeverity : 'warning'} label={fault === 'NORMAL' ? 'NOMINAL' : 'ENV RESTRICT'} pulse={fault !== 'NORMAL'} />
                  </div>
                </div>
              </div>
              <p className="text-[9px] uppercase tracking-widest text-muted">
                ENV: {fault === 'NORMAL' ? 'CLEAR' : `RESTRICTED · ${fault.replace(/_/g, ' ')}`}
              </p>
            </div>
          </Panel>

          <Panel
            title="ALERT FEED"
            className="min-h-0 flex-1"
            right={
              <button
                type="button"
                onClick={() => navigate('/diagnostics')}
                className={`text-[8px] font-bold uppercase tracking-widest ${aiOnline ? 'text-nominal' : 'text-caution'}`}
              >
                {aiOnline ? 'AI ONLINE' : 'AI LINKING…'}
              </button>
            }
          >
            <AlertFeed />
          </Panel>
        </aside>
      </div>

      {/* bottom: trends + scenario / replay */}
      <div className="grid grid-cols-12 gap-3">
        <Panel
          title="TREND CHARTS · LAST 60 S"
          bodyClassName="px-2 py-2"
          className="col-span-12 lg:col-span-9"
          right={<span className="num text-[8px] text-muted">10 Hz WINDOW · RING {ring.length}/600</span>}
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 xl:grid-cols-7">
            {CHART_PARAMS.map((p) => {
              const rule = RULE_BY_PARAM.get(p.key);
              const value = frame?.[p.key] ?? 0;
              const sev = rule ? classifyValue(rule, value) : 'nominal';
              const color = sev !== 'nominal' ? SEVERITY_COLOR[sev] : undefined;
              return (
                <TrendChart
                  key={p.key}
                  label={p.label}
                  unit={p.unit}
                  series={series[p.key] ?? []}
                  min={p.min}
                  max={p.max}
                  color={color}
                  height={64}
                  current={frame?.[p.key]}
                  format={CHART_FORMAT[p.key]}
                />
              );
            })}
          </div>
        </Panel>

        <Panel
          title={mode === 'LIVE_SIM' ? 'SCENARIO SIM' : 'DATASET REPLAY'}
          className="col-span-12 lg:col-span-3"
          bodyClassName="p-2.5"
        >
          {mode === 'LIVE_SIM' ? (
            <ScenarioSim />
          ) : (
            <div className="flex flex-col gap-3">
              <DatasetPicker />
              <ScrubBar />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}