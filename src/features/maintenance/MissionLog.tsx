import { HorizontalSwiper } from '../../components/HorizontalSwiper';
import { SEVERITY_COLOR } from '../../lib/palette';
import { useMissionStore } from '../../state/missionStore';
import { fmtClock } from '../../lib/format';

const TYPE_LABEL: Record<string, string> = {
  MODE: 'MODE',
  DATASET: 'DATASET',
  FAULT: 'FAULT',
  LINK: 'LINK',
  AI_PRECURSOR: 'AI',
  LIMIT: 'LIMIT',
  SYSTEM: 'SYS',
};

export function MissionLog() {
  const log = useMissionStore((s) => s.log);

  return (
    <HorizontalSwiper labelledBy="Mission and fault history">
      {log.length === 0 && (
        <div className="surface-2 swiper-item w-72 p-3 text-[10px] text-muted">No events logged yet.</div>
      )}
      {log.map((e) => (
        <div key={e.id} className="surface-2 swiper-item w-72 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: SEVERITY_COLOR[e.severity] }}>
              {TYPE_LABEL[e.type] ?? e.type}
            </span>
            <span className="num text-[8px] text-muted">{fmtClock(e.ts)}</span>
          </div>
          <p className="mt-1 text-[10px] leading-snug">{e.message}</p>
        </div>
      ))}
    </HorizontalSwiper>
  );
}