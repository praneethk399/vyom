import { useEffect } from 'react';
import { useTelemetryEngine } from '../features/telemetry/useTelemetryEngine';
import { useAlertDelivery } from '../features/alerts/deliveryController';
import { useDiagnostics } from '../features/diagnostics/useDiagnostics';
import { useUiStore } from '../state/uiStore';
import { useMissionStore } from '../state/missionStore';

/**
 * The running system: telemetry, alert delivery and the AI analysis loop are
 * global, so mode/fault/replay state on Command visibly ripples into Sensor
 * Twin, AI Diagnostics and Maintenance.
 */
export function AppEffects() {
  useTelemetryEngine();
  useAlertDelivery();
  useDiagnostics();

  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    void useMissionStore.getState().fetchDatasets();
    if (!bootLogged) {
      bootLogged = true;
      useMissionStore.getState().addLog('SYSTEM', 'VYOM CORE ONLINE — TELEMETRY STREAM ACTIVE', 'nominal');
    }
  }, []);

  return null;
}let bootLogged = false;
