import { useRef } from 'react';
import { useTelemetryStore } from '../../state/telemetryStore';
import { useMissionStore } from '../../state/missionStore';
import { fetchDataset } from '../telemetry/datasetReplay';
import { systemEvent } from '../telemetry/useTelemetryEngine';

export function DatasetPicker() {
  const datasets = useMissionStore((s) => s.datasets);
  const selectDataset = useMissionStore((s) => s.selectDataset);
  const datasetMeta = useTelemetryStore((s) => s.datasetMeta);
  const setDatasetLoading = useTelemetryStore((s) => s.setDatasetLoading);
  const setLinkOk = useTelemetryStore((s) => s.setLinkOk);
  const loading = useTelemetryStore((s) => s.datasetLoading);
  // guards against out-of-order dataset fetches: whichever click is LAST
  // wins, even if an earlier (slower) request resolves after it
  const requestSeq = useRef(0);

  const load = async (id: string) => {
    if (id === datasetMeta?.id) return;
    const seq = ++requestSeq.current;
    setDatasetLoading(true);
    try {
      const ds = await fetchDataset(id);
      if (seq !== requestSeq.current) return; // a newer selection superseded this one
      useTelemetryStore.getState().resetStream();
      useTelemetryStore.getState().loadDataset(ds);
      selectDataset(id);
      setLinkOk(true);
      systemEvent('DATASET', `DATASET LOADED — ${ds.name}`, 'nominal');
    } catch {
      if (seq !== requestSeq.current) return;
      setLinkOk(false);
      systemEvent('LINK', 'LINK LOST — DATASET FETCH FAILED', 'caution');
    } finally {
      if (seq === requestSeq.current) setDatasetLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {loading && <p className="text-[9px] uppercase tracking-widest text-accent">Loading dataset…</p>}
      {datasets.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => void load(d.id)}
          aria-pressed={datasetMeta?.id === d.id}
          className={`border px-2 py-1.5 text-left transition-colors ${
            datasetMeta?.id === d.id
              ? 'border-[var(--accent)] bg-accent-soft'
              : 'border-[var(--line)] hover:border-[var(--line-strong)]'
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wide ${datasetMeta?.id === d.id ? 'text-accent' : 'text-[var(--text)]'}`}>
              {d.name}
            </span>
            <span className="num text-[8px] text-muted">{d.samplingRateHz} Hz</span>
          </div>
          <p className="mt-0.5 text-[9px] leading-snug text-muted">{d.description}</p>
        </button>
      ))}
    </div>
  );
}