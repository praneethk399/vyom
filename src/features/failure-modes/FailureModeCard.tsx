import { SEVERITY_COLOR } from '../../lib/palette';
import { useUiStore } from '../../state/uiStore';
import type { ProbableFailureMode, Severity } from '../../lib/types';
import { StatusBadge } from '../../components/StatusBadge';

function statusSeverity(status: ProbableFailureMode['status']): Severity {
  if (status === 'IMMINENT_BREACH') return 'critical';
  if (status === 'PRECURSOR_ACTIVE') return 'warning';
  return 'nominal';
}

interface FailureModeCardProps {
  failure: ProbableFailureMode;
  compact?: boolean;
}

export function FailureModeCard({ failure, compact = false }: FailureModeCardProps) {
  const setActive = useUiStore((s) => s.setActiveSubsystem);
  const color = SEVERITY_COLOR[statusSeverity(failure.status)];
  const pct = Math.round(failure.probability * 100);

  return (
    <button
      type="button"
      onClick={() => setActive(failure.subsystem)}
      className="surface w-full text-left transition-colors hover:bg-accent-soft"
      title="Highlight subsystem on the 3D model"
    >
      <div className="flex items-start justify-between gap-2 p-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow">{failure.subsystem}</span>
            <StatusBadge severity={statusSeverity(failure.status)} pulse={failure.status !== 'NOMINAL'} />
          </div>
          <p className="mt-1 text-[12px] font-semibold leading-tight">{failure.failureMode}</p>
          {!compact && failure.precursorsDetected.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {failure.precursorsDetected.map((p) => (
                <span key={p} className="border px-1 py-0.5 text-[8px] uppercase tracking-wider text-muted">
                  {p}
                </span>
              ))}
            </div>
          )}
          {!compact && (
            <p className="mt-1.5 text-[10px] leading-snug text-muted">{failure.mitigationAction}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="num text-lg font-bold" style={{ color }}>
            {pct}%
          </span>
          <span className="text-[8px] uppercase tracking-widest text-muted">PROB</span>
          {failure.timeToFailureHours !== null && (
            <>
              <span className="num text-sm font-semibold">{failure.timeToFailureHours} h</span>
              <span className="text-[8px] uppercase tracking-widest text-muted">TTF</span>
            </>
          )}
        </div>
      </div>
      <div className="bd-t h-1" style={{ background: `linear-gradient(90deg, ${color} ${pct}%, transparent ${pct}%)` }} />
    </button>
  );
}