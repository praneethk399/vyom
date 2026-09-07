import { useMemo } from 'react';
import { useTelemetryStore } from '../state/telemetryStore';
import { useThrottledRing } from '../features/telemetry/useThrottledRing';
import { Panel } from '../components/Panel';
import { Reveal } from '../components/Reveal';
import { TsDiagram } from '../components/TsDiagram';
import { fmt2, fmtAgo } from '../lib/format';
import { RING_MAX } from '../state/telemetryStore';
import { classifyValue, RULE_BY_PARAM } from '../lib/thresholds';

const SENSORS: { name: string; key: 'tet' | 'n2Rpm' | 'pressureRatio' | 'vibration' | 'oilPressure' | 'fuelFlow' | 'batteryVoltage'; unit: string }[] = [
  { name: 'TET THERMOCOUPLE', key: 'tet', unit: 'K' },
  { name: 'N2 SPOOL TACH', key: 'n2Rpm', unit: 'rpm' },
  { name: 'EPR TRANSDUCER', key: 'pressureRatio', unit: ':1' },
  { name: 'VIBE ACCEL', key: 'vibration', unit: 'g' },
  { name: 'OIL PRESS', key: 'oilPressure', unit: 'PSI' },
  { name: 'FUEL FLOW', key: 'fuelFlow', unit: 'L/h' },
  { name: 'BATT BUS', key: 'batteryVoltage', unit: 'V' },
];

export function SensorTwin() {
  const mode = useTelemetryStore((s) => s.mode);
  const frame = useTelemetryStore((s) => s.frame);
  const ring = useThrottledRing();
  const frameSeq = useTelemetryStore((s) => s.frameSeq);
  const datasetMeta = useTelemetryStore((s) => s.datasetMeta);

  const spikes = useMemo(() => {
    let n = 0;
    for (let i = 1; i < ring.length; i++) {
      if (Math.abs(ring[i].telemetry.vibration - ring[i - 1].telemetry.vibration) > 0.55) n++;
    }
    return n;
  }, [ring]);

  const age = ring.length > 0 ? Date.now() - ring[ring.length - 1].ts : null;
  const tetSev = classifyValue(RULE_BY_PARAM.get('tet')!, frame?.tet ?? 0);
  const sampleRate = mode === 'DATASET_REPLAY' ? (datasetMeta?.samplingRateHz ?? 10) : 10;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {/* ingestion pipeline */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* stage 1: sensor bus */}
        <Panel title="STAGE 01 · SENSOR BUS" bodyClassName="p-2.5">
          <ul className="flex flex-col gap-1">
            {SENSORS.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-2 bd-b py-1 last:border-0">
                <span className="text-[9px] uppercase tracking-widest text-muted">{s.name}</span>
                <span className="num text-[11px] text-accent">
                  {frame ? `${frame[s.key]}` : '—'} <span className="text-[8px] text-muted">{s.unit}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* stage 2: cleaning & validation */}
        <Panel title="STAGE 02 · CLEANING & VALIDATION" bodyClassName="p-2.5">
          <div className="flex flex-col gap-2">
            {[
              { label: 'PACKETS IN (WINDOW)', value: ring.length },
              { label: 'SPIKE REJECTED', value: spikes },
              { label: 'VALIDATED FRAMES', value: ring.length - spikes },
            ].map((row) => (
              <div key={row.label} className="surface-2 flex items-baseline justify-between px-2.5 py-2">
                <span className="text-[9px] uppercase tracking-widest text-muted">{row.label}</span>
                <span className="num text-lg font-bold text-accent">{row.value}</span>
              </div>
            ))}
            <p className="text-[9px] leading-snug text-muted">
              Rolling window validation: spike rejection on vibration deltas {'>'} 0.55 g, rate-limit on TET slope.
            </p>
          </div>
        </Panel>

        {/* stage 3: twin sync */}
        <Panel title="STAGE 03 · TWIN SYNC" bodyClassName="p-2.5">
          <div className="flex flex-col gap-2">
            <div className="surface-2 flex items-baseline justify-between px-2.5 py-2">
              <span className="text-[9px] uppercase tracking-widest text-muted">SYNC STATE</span>
              <span className={`text-[11px] font-bold uppercase tracking-widest ${age !== null && age < 1200 ? 'text-nominal' : 'text-warning'}`}>
                {age !== null && age < 1200 ? 'SYNCED' : 'STALE'}
              </span>
            </div>
            <div className="surface-2 flex items-baseline justify-between px-2.5 py-2">
              <span className="text-[9px] uppercase tracking-widest text-muted">RING BUFFER</span>
              <span className="num text-lg font-bold">{ring.length}<span className="text-[9px] text-muted">/{RING_MAX}</span></span>
            </div>
            <div className="surface-2 flex items-baseline justify-between px-2.5 py-2">
              <span className="text-[9px] uppercase tracking-widest text-muted">FRAME SEQ</span>
              <span className="num text-lg font-bold">{frameSeq}</span>
            </div>
          </div>
        </Panel>
      </div>

      {/* packet travel strip */}
      <div className="relative h-8 overflow-hidden" aria-hidden="true">
        <div className="absolute left-[6%] right-[6%] top-1/2 h-px -translate-y-1/2" style={{ background: 'var(--line-strong)' }} />
        {[0, 0.6, 1.2, 1.8].map((d) => (
          <span
            key={d}
            className="packet absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2"
            style={{ background: 'var(--accent)', animationDelay: `${d}s`, left: '6%' }}
          />
        ))}
      </div>

      {/* T-s diagram centerpiece */}
      <Reveal className="flex-1">
        <Panel
          title="T–s CYCLE DIAGRAM · LIVE BRAYTON LOOP"
          className="h-full"
          right={
            <span className="num text-[9px] text-muted">
              TET {frame ? fmt2(frame.tet) : '—'} K · PR {frame ? fmt2(frame.pressureRatio) : '—'}
            </span>
          }
        >
          <div className="flex h-full flex-col gap-2 lg:flex-row">
            <div className="min-h-[260px] flex-1">
              {frame ? (
                <TsDiagram
                  entropyPoints={frame.entropyPoints}
                  tet={frame.tet}
                  pressureRatio={frame.pressureRatio}
                  severity={tetSev}
                  className="h-full"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-widest text-muted">
                  AWAITING FRAME…
                </div>
              )}
            </div>
            <aside className="flex shrink-0 flex-col gap-2 lg:w-56">
              <div className="surface-2 p-2.5">
                <span className="eyebrow">THE PHYSICS, VISIBLE</span>
                <p className="mt-1 text-[10px] leading-snug text-muted">
                  The solid loop is the live cycle (compressor inlet → outlet → turbine inlet → outlet).
                  The dim dashed loop is the ideal Brayton reference. Entropy drift between them is the
                  irreversibility signature — compressors and turbines add Δs the ideal cycle cannot.
                </p>
              </div>
              <div className="surface-2 p-2.5">
                <span className="eyebrow">CYCLE EFFICIENCY</span>
                <span className="num mt-1 block text-2xl font-bold text-accent">
                  {frame ? `${frame.efficiency.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="surface-2 p-2.5">
                <span className="eyebrow">EGT REGIME</span>
                <span className={`num mt-1 block text-lg font-bold ${tetSev === 'nominal' ? 'text-nominal' : tetSev === 'warning' ? 'text-warning' : 'text-critical'}`}>
                  {tetSev.toUpperCase()}
                </span>
              </div>
            </aside>
          </div>
        </Panel>
      </Reveal>

      {/* data-quality strip */}
      <Panel title="DATA QUALITY STRIP" bodyClassName="p-2.5">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            { label: 'SYNC LATENCY', value: age !== null ? `${age} ms` : '—' },
            { label: 'SAMPLE RATE', value: `${sampleRate.toFixed(1)} Hz` },
            { label: 'LAST FRAME AGE', value: age !== null ? fmtAgo(ring[ring.length - 1].ts) : '—' },
            { label: 'BUFFER FILL', value: `${Math.round((ring.length / RING_MAX) * 100)}%` },
          ].map((s) => (
            <div key={s.label} className="surface-2 flex flex-col px-2.5 py-2">
              <span className="text-[8px] uppercase tracking-widest text-muted">{s.label}</span>
              <span className="num mt-0.5 text-sm font-bold text-accent">{s.value}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}