import { FAULT_CLASSES, FAULT_PROFILES } from '../telemetry/liveSim';
import { useTelemetryStore } from '../../state/telemetryStore';
import { useAlertStore } from '../../state/alertStore';
import { systemEvent } from '../telemetry/useTelemetryEngine';
import { addAlert, buildScenarioAlert, sendAlertSMS } from '../alerts/scenarioAlerts';
import type { FaultClass, Severity } from '../../lib/types';

const FAULT_SEVERITY: Record<FaultClass, Severity> = {
  NORMAL: 'nominal',
  TET_RUNWAY: 'warning',
  VIBRATION_GROWTH: 'warning',
  OIL_PRESSURE_LOSS: 'warning',
  COMPRESSOR_STALL: 'warning',
  FUEL_FLOW_ANOMALY: 'caution',
  BATTERY_SAG: 'caution',
};

export function ScenarioSim() {
  const fault = useTelemetryStore((s) => s.fault);
  const setFault = useTelemetryStore((s) => s.setFault);

  const inject = (f: FaultClass) => {
    setFault(f);

    // Standardized alert through the whole pipeline: feed entry + visual
    // delivery, then SMS for WARNING/CRITICAL (deduped server + client).
    const alert = buildScenarioAlert(f);
    addAlert(alert);
    void sendAlertSMS(alert);

    if (f === 'NORMAL') {
      // Clear active fault conditions — dim outstanding alerts, drop residual
      // limit state so gauges/badges return to nominal. No SMS is sent.
      useAlertStore.getState().acknowledgeAll();
      useTelemetryStore.setState({ limitState: {} });
      systemEvent('FAULT', 'FAULT CLEARED — ALL SYSTEMS NOMINAL', 'nominal');
    } else {
      systemEvent('FAULT', `FAULT INJECTED — ${FAULT_PROFILES[f].label}`, FAULT_SEVERITY[f]);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="mb-0.5 text-[10px] text-muted">Inject a fault class — the deterministic layer reacts instantly, the AI layer within one polling cycle.</p>
      <div className="grid grid-cols-2 gap-1.5">
        {FAULT_CLASSES.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => inject(f)}
            aria-pressed={fault === f}
            className={`border px-2 py-1.5 text-left text-[9px] font-bold uppercase tracking-[0.12em] transition-colors ${
              fault === f
                ? 'border-[var(--accent)] bg-accent-soft text-accent'
                : 'border-[var(--line)] text-muted hover:border-[var(--line-strong)] hover:text-[var(--text)]'
            }`}
          >
            {FAULT_PROFILES[f].label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[9px] uppercase tracking-widest text-muted">
        ENV: {fault === 'NORMAL' ? 'CLEAR' : 'RESTRICTED'}
      </p>
    </div>
  );
}