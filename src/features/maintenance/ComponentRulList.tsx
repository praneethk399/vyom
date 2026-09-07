import { useTelemetryStore } from '../../state/telemetryStore';
import { CONDITION_COLOR, componentsWithFaults } from './data';
import { CountUp } from '../../components/CountUp';

const CONDITION_LABEL: Record<string, string> = {
  EXCELLENT: 'EXCELLENT',
  GOOD: 'GOOD',
  MONITOR: 'MONITOR',
  ACTION_REQUIRED: 'ACTION REQ.',
};

export function ComponentRulList() {
  const fault = useTelemetryStore((s) => s.fault);
  const components = componentsWithFaults(fault);

  return (
    <div className="flex flex-col gap-2.5">
      {components.map((c) => {
        const color = CONDITION_COLOR[c.condition];
        const pct = Math.round((c.rulHours / c.nominalTboHours) * 100);
        return (
          <div key={c.id} className="bd-b pb-2 last:border-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide">{c.name}</span>
              <span className="text-[8px] font-bold uppercase tracking-[0.14em]" style={{ color }}>
                {CONDITION_LABEL[c.condition]}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1" style={{ background: 'var(--panel-3)' }}>
                <div className="h-full" style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className="num text-[10px] text-muted">
                <CountUp value={c.rulHours} format={(v) => `${Math.round(v)} h`} /> / {c.nominalTboHours} h TBO
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-muted">{c.recommendation}</p>
            <span className="text-[8px] uppercase tracking-widest text-muted">{c.lifingModel}</span>
          </div>
        );
      })}
    </div>
  );
}