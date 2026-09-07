import { useEffect, useRef } from 'react';
import { useAlertStore } from '../../state/alertStore';
import { useUiStore } from '../../state/uiStore';
import { useMissionStore } from '../../state/missionStore';
import { vibrate } from './vibration';
import { screenShake } from './shake';
import type { AlertNotification } from '../../lib/types';

const reducedMotionMedia =
  typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/**
 * Severity delivery ladder:
 *  caution  -> amber highlight on the gauge + toast
 *  warning  -> amber pulse on the panel + toast + short vibrate(200)
 *  critical -> red vignette flash + banner + screen shake + vibrate([100,50,100,50,200])
 *
 * Motion/haptics are gated by prefers-reduced-motion and the Alert Intensity
 * setting (FULL / REDUCED / SILENT). Color + toast always remain as the
 * non-motion cue.
 */
export function useAlertDelivery(): void {
  const processed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handle = (alert: AlertNotification): void => {
      const ui = useUiStore.getState();
      const intensity = ui.alertIntensity;
      const reduced = reducedMotionMedia?.matches ?? false;
      const motionOk = !reduced && intensity === 'FULL';
      const silent = intensity === 'SILENT';

      switch (alert.severity) {
        case 'caution':
          if (!silent) ui.pushToast({ id: alert.id, severity: alert.severity, title: alert.title, message: alert.message });
          break;
        case 'warning':
          if (!silent) {
            ui.pushToast({ id: alert.id, severity: alert.severity, title: alert.title, message: alert.message });
            ui.flashPulse();
          }
          if (motionOk) vibrate(200);
          break;
        case 'critical':
          useMissionStore.getState().addLog('LIMIT', `${alert.title} — ${alert.message}`, 'critical');
          if (!silent) {
            ui.pushToast({ id: alert.id, severity: alert.severity, title: alert.title, message: alert.message });
            ui.flashVignette();
          }
          if (motionOk) screenShake();
          if (motionOk && !reduced) vibrate([100, 50, 100, 50, 200]);
          break;
        default:
          break;
      }
    };

    const unsub = useAlertStore.subscribe((state) => {
      for (const a of state.alerts) {
        if (a.severity === 'nominal' || a.acknowledged) continue;
        if (processed.current.has(a.id)) continue;
        processed.current.add(a.id);
        handle(a);
      }
    });

    // deliver anything raised before the controller mounted
    for (const a of useAlertStore.getState().alerts) {
      if (a.severity === 'nominal' || a.acknowledged || processed.current.has(a.id)) continue;
      processed.current.add(a.id);
      handle(a);
    }

    return unsub;
  }, []);
}