import { useNavigate } from 'react-router-dom';
import { useDiagnosticsStore } from '../state/diagnosticsStore';
import { useUiStore } from '../state/uiStore';
import { Panel } from '../components/Panel';
import { Reveal } from '../components/Reveal';
import { AIDiagnosticReportPanel } from '../features/diagnostics/AIDiagnosticReportPanel';
import { FailureModeCard } from '../features/failure-modes/FailureModeCard';
import { modelMeta } from '../lib/aiInference';
import { SEVERITY_COLOR } from '../lib/palette';
import { SUBSYSTEMS } from '../lib/types';

function OnDeviceModelPanel() {
  const onDevice = useDiagnosticsStore((s) => s.onDevice);
  return (
    <Panel
      title="ON-DEVICE MODEL · TRAINED FAILURE CLASSIFIER"
      right={<span className="num text-[8px] text-muted">BROWSER INFERENCE · NO NETWORK</span>}
      bodyClassName="p-2.5"
    >
      {!onDevice ? (
        <p className="p-2 text-[10px] uppercase tracking-widest text-muted">Awaiting first inference cycle…</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <div className="surface-2 p-2">
              <span className="eyebrow">TOP PREDICTION</span>
              <div className="num mt-1 text-sm font-bold text-accent glow-soft">{onDevice.topSubsystem}</div>
            </div>
            <div className="surface-2 p-2">
              <span className="eyebrow">CONFIDENCE</span>
              <div className="num mt-1 text-sm font-bold">{(onDevice.topProbability * 100).toFixed(1)}%</div>
            </div>
            <div className="surface-2 p-2">
              <span className="eyebrow">RUL (BLENDED)</span>
              <div className="num mt-1 text-sm font-bold">{Math.round(onDevice.rulHoursBlended)} h</div>
            </div>
            <div className="surface-2 p-2">
              <span className="eyebrow">RAW MODEL RUL</span>
              <div className="num mt-1 text-sm font-bold">{Math.round(onDevice.rulHours)} h</div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            {onDevice.probabilities.map(({ subsystem, p }) => {
              const hot = subsystem !== 'Normal' && p >= 0.35;
              return (
                <div key={subsystem} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-[9px] uppercase tracking-wider text-muted">{subsystem}</span>
                  <div className="h-1.5 min-w-0 flex-1" style={{ background: 'var(--panel-3)' }}>
                    <div
                      className="h-full transition-[width] duration-300"
                      style={{ width: `${Math.min(100, p * 100)}%`, background: hot ? SEVERITY_COLOR.warning : 'var(--accent)' }}
                    />
                  </div>
                  <span className="num w-12 shrink-0 text-right text-[9px]">{(p * 100).toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
          <p className="text-[9px] leading-snug text-muted">
            Logistic-regression failure-mode classifier + ridge RUL regressor trained on the UAV telemetry corpora
            ({modelMeta.trainedOn.join(' · ')}) — validation accuracy {(modelMeta.valAccuracy * 100).toFixed(1)}%,
            macro-F1 {modelMeta.valMacroF1.toFixed(2)}, RUL MAE ±{modelMeta.rulMAEh} h. Runs fully in-browser;
            the /api/diagnose Gemini/rule-based report remains the higher-fidelity layer above.
          </p>
        </div>
      )}
    </Panel>
  );
}

export function AiDiagnostics() {
  const navigate = useNavigate();
  const report = useDiagnosticsStore((s) => s.report);
  const setActive = useUiStore((s) => s.setActiveSubsystem);
  const failures = report?.probableFailures ?? [];

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <Reveal>
        <Panel title="AI DIAGNOSTIC REPORT" bodyClassName="p-2.5">
          <AIDiagnosticReportPanel />
        </Panel>
      </Reveal>

      <Reveal>
        <OnDeviceModelPanel />
      </Reveal>

      <Panel
        title="PROBABLE FAILURE MODES · BY SUBSYSTEM"
        right={
          <span className="num text-[8px] text-muted">
            {report ? `${failures.length} MODES · CLICK CARD → 3D HIGHLIGHT` : 'AWAITING REPORT'}
          </span>
        }
      >
        {!report ? (
          <div className="flex items-center justify-center p-6 text-[10px] uppercase tracking-widest text-muted">
            Probable failure modes populate after the first analysis cycle.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {SUBSYSTEMS.map((sub) => {
              const subFailures = failures.filter((f) => f.subsystem === sub);
              if (subFailures.length === 0) return null;
              return (
                <section key={sub}>
                  <h3 className="eyebrow mb-1.5 text-accent">{sub}</h3>
                  <div
                    className="grid cursor-pointer grid-cols-1 gap-1.5 md:grid-cols-2"
                    onClick={() => {
                      setActive(sub);
                      navigate('/command');
                    }}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setActive(sub);
                        navigate('/command');
                      }
                    }}
                  >
                    {subFailures.map((f) => (
                      <FailureModeCard key={f.id} failure={f} />
                    ))}
                  </div>
                </section>
              );
            })}
            {failures.length === 0 && (
              <div className="surface-2 p-4 text-[10px] uppercase tracking-widest text-muted">
                No failure modes reported — all subsystems nominal.
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}