import { AnimatePresence, motion } from 'motion/react';
import { useUiStore } from '../../state/uiStore';
import { useAlertStore } from '../../state/alertStore';
import { SEVERITY_COLOR } from '../../lib/palette';
import type { Severity } from '../../lib/types';

const RANK: Record<Severity, number> = { nominal: 0, caution: 1, warning: 2, critical: 3 };

export function ToastStack() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 48 }}
            className="bd-l surface pointer-events-auto px-3 py-2"
            style={{ borderLeftWidth: 3, borderLeftColor: SEVERITY_COLOR[t.severity] }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: SEVERITY_COLOR[t.severity] }}>
                {t.severity.toUpperCase()}
              </span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss toast"
                className="text-[10px] text-muted hover:text-[var(--text)]"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] font-semibold leading-tight">{t.title}</p>
            <p className="text-[10px] leading-snug text-muted">{t.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Red vignette flash + amber panel pulse — keyed so each alert replays */
export function AlertOverlays() {
  const vignette = useUiStore((s) => s.vignette);
  const pulse = useUiStore((s) => s.pulse);
  const acknowledge = useAlertStore((s) => s.acknowledge);
  const banner = useAlertStore((s) =>
    s.alerts
      .filter((a) => (a.severity === 'warning' || a.severity === 'critical') && !a.acknowledged)
      .sort((a, b) => RANK[b.severity] - RANK[a.severity])[0],
  );

  return (
    <>
      {vignette && (
        <div
          key={vignette.id}
          className="vignette-flash pointer-events-none fixed inset-0 z-40"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 52%, rgba(239,68,68,0.5) 100%)',
          }}
          aria-hidden="true"
        />
      )}
      {pulse && <div key={pulse.id} className="pulse-amber pointer-events-none fixed inset-0 z-40" aria-hidden="true" />}
      {banner && (
        <div
          className="fixed left-1/2 top-14 z-40 flex max-w-[min(92vw,560px)] -translate-x-1/2 items-center gap-3 border px-3 py-2"
          style={{
            background: 'var(--panel)',
            borderColor: SEVERITY_COLOR[banner.severity],
            boxShadow: `0 0 0 1px ${SEVERITY_COLOR[banner.severity]}33`,
          }}
          role="alert"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: SEVERITY_COLOR[banner.severity] }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: SEVERITY_COLOR[banner.severity] }}>
              {banner.severity.toUpperCase()} — {banner.title}
            </p>
            <p className="truncate text-[10px] text-muted">{banner.message}</p>
          </div>
          <button
            type="button"
            onClick={() => acknowledge(banner.id)}
            className="ml-auto shrink-0 border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-muted hover:text-accent"
          >
            ACK
          </button>
        </div>
      )}
    </>
  );
}