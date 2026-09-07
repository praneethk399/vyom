import { useMissionStore } from '../../state/missionStore';
import { useTelemetryStore } from '../../state/telemetryStore';
import { useUiStore } from '../../state/uiStore';

const GRADE_COLOR: Record<string, string> = { A: 'var(--nominal)', B: 'var(--monitor)', C: 'var(--action)' };

export function MissionMatrix() {
  const datasets = useMissionStore((s) => s.datasets);
  const selectedId = useTelemetryStore((s) => s.datasetMeta?.id);
  const setActive = useUiStore((s) => s.setActiveSubsystem);

  const selected = datasets.find((d) => d.id === selectedId) ?? datasets[0];

  return (
    <div className="flex flex-col gap-3">
      {selected && (
        <div className="surface-2 p-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-accent">{selected.name}</span>
            <span className="text-[8px] uppercase tracking-widest text-muted">{selected.startTime}</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <div className="num text-2xl font-bold" style={{ color: GRADE_COLOR[selected.reliability.grade] }}>
                {selected.reliability.grade}
              </div>
              <div className="text-[8px] uppercase tracking-widest text-muted">GRADE</div>
            </div>
            <div>
              <div className="num text-2xl font-bold text-accent">{selected.reliability.completionPct}%</div>
              <div className="text-[8px] uppercase tracking-widest text-muted">COMPLETION</div>
            </div>
            <div>
              <div className="num text-2xl font-bold" style={{ color: selected.reliability.faultsLogged > 0 ? 'var(--monitor)' : 'var(--nominal)' }}>
                {selected.reliability.faultsLogged}
              </div>
              <div className="text-[8px] uppercase tracking-widest text-muted">FAULTS LOGGED</div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[9px] uppercase tracking-widest text-muted">DIRECTIVE</span>
            <span className="text-right text-[10px] font-semibold uppercase tracking-wide">{selected.reliability.directive}</span>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-[8px] uppercase tracking-widest text-muted">
              <th className="bd-b bd-r px-1.5 py-1 font-medium">MISSION</th>
              <th className="bd-b bd-r px-1.5 py-1 font-medium">GRADE</th>
              <th className="bd-b bd-r px-1.5 py-1 font-medium">COMPLETION</th>
              <th className="bd-b bd-r px-1.5 py-1 font-medium">DIRECTIVE</th>
              <th className="bd-b px-1.5 py-1 font-medium">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {datasets.map((d) => (
              <tr key={d.id} className={d.id === selected?.id ? 'bg-accent-soft' : ''}>
                <td className="bd-b bd-r px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide">{d.missionId}</td>
                <td className="bd-b bd-r px-1.5 py-1 num text-[10px] font-bold" style={{ color: GRADE_COLOR[d.reliability.grade] }}>
                  {d.reliability.grade}
                </td>
                <td className="bd-b bd-r px-1.5 py-1 num text-[10px]">{d.reliability.completionPct}%</td>
                <td className="bd-b bd-r px-1.5 py-1 text-[9px] uppercase tracking-wide text-muted">{d.reliability.directive}</td>
                <td className="bd-b px-1.5 py-1">
                  {d.reliability.faultsLogged > 0 ? (
                    <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: 'var(--monitor)' }}>
                      RESTRICT
                    </span>
                  ) : (
                    <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: 'var(--nominal)' }}>
                      CLEAR
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => setActive('Turbine')}
        className="self-start border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted hover:text-accent"
      >
        SYNC TO 3D MODEL →
      </button>
    </div>
  );
}