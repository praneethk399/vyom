import { AnimatePresence, motion } from 'motion/react';
import { useAlertStore } from '../../state/alertStore';
import { SEVERITY_COLOR } from '../../lib/palette';
import { fmtClock } from '../../lib/format';
import type { AlertNotification } from '../../lib/types';

const CATEGORY_SHORT: Record<AlertNotification['category'], string> = {
  PREDICTIVE_PRECURSOR: 'PREDICT',
  ACTIVE_LIMIT: 'LIMIT',
  SYSTEM_ADVISORY: 'SYS',
};

const SMS_CHIP: Record<string, { label: string; cls: string }> = {
  sent: { label: 'SMS SENT', cls: 'text-nominal' },
  failed: { label: 'SMS FAILED', cls: 'text-critical' },
  'not-required': { label: 'SMS NOT REQUIRED', cls: 'text-muted' },
};

export function AlertFeed({ limit = 30 }: { limit?: number }) {
  const alerts = useAlertStore((s) => s.alerts);
  const acknowledge = useAlertStore((s) => s.acknowledge);
  const acknowledgeAll = useAlertStore((s) => s.acknowledgeAll);
  const visible = alerts.slice(0, limit);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="num text-[9px] text-muted">{alerts.filter((a) => !a.acknowledged).length} ACTIVE</span>
        <button
          type="button"
          onClick={acknowledgeAll}
          className="text-[8px] font-bold uppercase tracking-widest text-muted hover:text-accent"
        >
          ACK ALL
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        <AnimatePresence initial={false}>
          {visible.map((a) => {
            const color = SEVERITY_COLOR[a.severity];
            return (
              <motion.button
                key={a.id}
                type="button"
                layout
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: a.acknowledged ? 0.45 : 1, x: 0 }}
                exit={{ opacity: 0 }}
                onClick={() => acknowledge(a.id)}
                className="bd-l flex w-full flex-col gap-0.5 px-2 py-1.5 text-left transition-opacity hover:bg-accent-soft"
                style={{ borderLeftColor: color }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className={`cas-glyph cas-glyph-${a.severity}`} style={{ color }} aria-hidden="true" />
                    <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color }}>
                      {CATEGORY_SHORT[a.category]} · {a.severity.toUpperCase()}
                    </span>
                  </span>
                  <span className="num text-[8px] text-muted">{fmtClock(a.ts)}</span>
                </span>
                <span className="cas-msg-title text-[10px] font-semibold leading-tight">{a.title}</span>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[9px] leading-snug text-muted">{a.message}</span>
                  {a.sms && SMS_CHIP[a.sms] && (
                    <span className={`num shrink-0 text-[8px] font-bold tracking-widest ${SMS_CHIP[a.sms].cls}`}>
                      {SMS_CHIP[a.sms].label}
                    </span>
                  )}
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}