import { useEffect, useState } from 'react';
import { useTelemetryStore } from '../../state/telemetryStore';
import type { TelemetryFrame } from '../../lib/types';

/**
 * Ring snapshot quantized to ~3 Hz (with a trailing update so the final state
 * always lands). Gauges subscribe to `frame` at the full 10 Hz; heavy chart
 * consumers use this instead so recharts re-renders ~3x/s, not 10x/s.
 */
export function useThrottledRing(hz = 3): TelemetryFrame[] {
  const [ring, setRing] = useState(() => useTelemetryStore.getState().ring);

  useEffect(() => {
    const interval = 1000 / hz;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useTelemetryStore.subscribe((s) => {
      const now = Date.now();
      if (now - last >= interval) {
        last = now;
        setRing(s.ring);
      } else if (timer == null) {
        timer = setTimeout(() => {
          timer = undefined;
          last = Date.now();
          setRing(useTelemetryStore.getState().ring);
        }, interval - (now - last));
      }
    });
    return () => {
      unsub();
      if (timer != null) clearTimeout(timer);
    };
  }, [hz]);

  return ring;
}
