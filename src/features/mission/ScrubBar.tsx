import { useTelemetryStore } from '../../state/telemetryStore';
import { fmtDuration } from '../../lib/format';

export function ScrubBar() {
  const frames = useTelemetryStore((s) => s.frames);
  const index = useTelemetryStore((s) => s.replayIndex);
  const playing = useTelemetryStore((s) => s.replayPlaying);
  const setPlaying = useTelemetryStore((s) => s.setPlaying);
  const scrubTo = useTelemetryStore((s) => s.scrubTo);
  const hz = useTelemetryStore((s) => s.datasetMeta?.samplingRateHz ?? 10);

  const max = Math.max(0, frames.length - 1);
  const at = frames.length > 0 ? index / hz : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            // play-at-end restarts the mission instead of re-firing the
            // completion advisory on every press
            if (!playing && frames.length > 0 && index >= frames.length - 1) {
              useTelemetryStore.getState().resetStream();
              scrubTo(0);
              setPlaying(true);
            } else {
              setPlaying(!playing);
            }
          }}
          className="border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-accent hover:bg-accent-soft"
          aria-label={playing ? 'Pause replay' : 'Play replay'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="num text-[10px] text-muted">
          {fmtDuration(at)} / {fmtDuration(frames.length / hz)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        value={Math.min(index, max)}
        onChange={(e) => scrubTo(Number(e.target.value))}
        className="h-1 w-full cursor-pointer accent-[color:var(--accent)]"
        aria-label="Replay scrub"
      />
      <p className="text-[9px] uppercase tracking-widest text-muted">
        SCRUB — frame {index + 1}/{frames.length}
      </p>
    </div>
  );
}