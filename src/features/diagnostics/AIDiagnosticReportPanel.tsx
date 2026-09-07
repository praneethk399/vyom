import { useDiagnosticsStore } from '../../state/diagnosticsStore';
import { useTelemetryStore } from '../../state/telemetryStore';
import { fmtClock } from '../../lib/format';
import { StatusBadge } from '../../components/StatusBadge';
import { CountUp } from '../../components/CountUp';
import type { AssessmentBlock, OverallStatus, Severity } from '../../lib/types';

function statusSeverity(status: OverallStatus): Severity {
  if (status === 'CRITICAL') return 'critical';
  if (status === 'DEGRADED') return 'warning';
  if (status === 'ACCEPTABLE') return 'caution';
  return 'nominal';
}

function AssessmentPanel({ title, block }: { title: string; block: AssessmentBlock }) {
  return (
    <div className="surface-2 p-2.5">
      <h3 className="eyebrow mb-1.5 text-accent">{title}</h3>
      <p className="text-[11px] leading-snug">{block.summary}</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {block.findings.map((f) => (
          <li key={f} className="flex gap-1.5 text-[10px] leading-snug text-muted">
            <span className="text-accent">▸</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AIDiagnosticReportPanel() {
  const { report, engine, updatedAt, running, error } = useDiagnosticsStore();
  const fault = useTelemetryStore((s) => s.fault);

  if (!report) {
    return (
      <div className="surface flex flex-col items-center justify-center gap-2 p-8 text-center">
        <span className={`text-[10px] uppercase tracking-widest ${running ? 'text-accent blink' : 'text-muted'}`}>
          {running ? 'ANALYZING TELEMETRY WINDOW…' : 'AWAITING FIRST ANALYSIS CYCLE…'}
        </span>
        <p className="text-[10px] text-muted">
          POST /api/diagnose every ~4 s — threshold alerts are already live in the feed.
        </p>
      </div>
    );
  }

  const sev = statusSeverity(report.overallStatus);
  const isGemini = engine === 'gemini';
  const badge = isGemini
    ? 'AI-GENERATED ANALYSIS · GEMINI'
    : `SIMULATED ANALYSIS · RULE-BASED${fault !== 'NORMAL' ? ` · FAULT: ${fault}` : ''}`;

  return (
    <div className="flex flex-col gap-3">
      {!isGemini && (
        <div className="border border-dashed px-3 py-2 text-[10px] leading-snug text-muted" style={{ borderColor: 'var(--line-strong)' }}>
          Rule-based simulated analysis active{error ? ` (${error})` : ''} — the deterministic threshold layer below keeps running either way. Set GEMINI_API_KEY to enable live Gemini reports.
        </div>
      )}

      {/* header: status + score + RUL + confidence + risk */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="surface-2 flex flex-col justify-between p-3">
          <div className="flex items-center justify-between">
            <span className="eyebrow">OVERALL STATUS</span>
            <StatusBadge severity={sev} />
          </div>
          <span className="mt-2 text-lg font-bold uppercase tracking-wide" style={{ color: `var(--${sev === 'nominal' ? 'nominal' : sev === 'caution' ? 'caution' : sev === 'warning' ? 'warning' : 'critical'})` }}>
            {report.overallStatus}
          </span>
        </div>
        <div className="surface-2 p-3">
          <span className="eyebrow">HEALTH SCORE</span>
          <div className="mt-2 flex items-baseline gap-1">
            <CountUp value={report.healthScore} className="text-3xl font-bold text-accent" />
            <span className="text-[10px] text-muted">/100</span>
          </div>
        </div>
        <div className="surface-2 p-3">
          <span className="eyebrow">PREDICTED RUL</span>
          <div className="mt-2 flex items-baseline gap-1">
            <CountUp value={report.predictedRulHours} className="text-3xl font-bold" />
            <span className="text-[10px] text-muted">h</span>
          </div>
          <div className="mt-2 h-1 w-full" style={{ background: 'var(--panel-3)' }}>
            <div
              className="h-full"
              style={{ width: `${Math.round(report.confidenceScore * 100)}%`, background: 'var(--accent)' }}
            />
          </div>
          <span className="text-[8px] uppercase tracking-widest text-muted">CONFIDENCE {Math.round(report.confidenceScore * 100)}%</span>
        </div>
        <div className="surface-2 p-3 lg:col-span-2">
          <span className="eyebrow">PRIMARY RISK FACTOR</span>
          <p className="mt-2 text-[12px] font-semibold leading-snug">{report.primaryRiskFactor}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)', borderColor: 'var(--line-strong)' }}>
              {badge}
            </span>
            {updatedAt && <span className="text-[8px] uppercase tracking-widest text-muted">UPDATED {fmtClock(updatedAt)}</span>}
            <span className="text-[8px] uppercase tracking-widest text-muted">ENGINE {engine ?? '—'}</span>
          </div>
        </div>
      </div>

      {/* three assessment blocks */}
      <div className="grid gap-3 lg:grid-cols-3">
        <AssessmentPanel title="THERMODYNAMIC" block={report.thermodynamicAssessment} />
        <AssessmentPanel title="MECHANICAL / STRESS" block={report.mechanicalStressAssessment} />
        <AssessmentPanel title="ELECTRICAL / AUXILIARY" block={report.electricalAuxiliaryAssessment} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* root cause */}
        <div className="surface-2 p-2.5">
          <h3 className="eyebrow mb-1.5 text-accent">ROOT CAUSE ANALYSIS</h3>
          <ul className="flex flex-col gap-1.5">
            {report.rootCauseAnalysis.map((rc) => (
              <li key={`${rc.subsystem}-${rc.cause}`} className="flex items-start justify-between gap-2">
                <span className="text-[11px] leading-snug">
                  <span className="font-bold uppercase tracking-wide text-accent">{rc.subsystem}</span> — {rc.cause}
                </span>
                <span className="num shrink-0 text-[9px] text-muted">{Math.round(rc.confidence * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
        {/* recommended actions */}
        <div className="surface-2 p-2.5">
          <h3 className="eyebrow mb-1.5 text-accent">RECOMMENDED ACTIONS</h3>
          <ol className="flex flex-col gap-1.5">
            {report.recommendedActions.map((a, i) => (
              <li key={a} className="flex gap-2 text-[11px] leading-snug">
                <span className="num text-accent">{String(i + 1).padStart(2, '0')}</span>
                {a}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border px-3 py-2" style={{ borderColor: 'var(--line)' }}>
        <span className="text-[9px] uppercase tracking-widest text-muted">DRDO COMPLIANCE</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: sev === 'nominal' || sev === 'caution' ? 'var(--nominal)' : 'var(--warning)' }}>
          {report.drdoComplianceStatus}
        </span>
      </div>
    </div>
  );
}