import { Router } from 'express';
import { engineSim, isScenarioName, type ScenarioName } from '../lib/engineSim';
import { evaluateScenario } from '../lib/alertEngine';
import { runAlertPipeline } from '../lib/alertPipeline';
import { rateLimit } from '../lib/rateLimit';

/**
 * POST /api/simulation/scenario { scenario }
 * Supported: nominal | tet_runaway | vibration_growth | oil_pressure_loss |
 *            compressor_surge | fuel_flow_anomaly | battery_sag
 *
 * Applies the scenario to the simulated engine, evaluates it through the
 * centralized alert engine, records the alert and (WARNING/CRITICAL only)
 * sends SMS. Returns the new telemetry snapshot + the alert with its SMS
 * status so the client has one authoritative result.
 */
const router = Router();

router.post('/', rateLimit({ windowMs: 60_000, max: 60 }), async (req, res) => {
  const scenario = (req.body as { scenario?: unknown })?.scenario;
  if (!isScenarioName(scenario)) {
    res.status(400).json({ ok: false, error: `invalid scenario — expected one of: nominal, tet_runaway, vibration_growth, oil_pressure_loss, compressor_surge, fuel_flow_anomaly, battery_sag` });
    return;
  }

  const name = scenario as ScenarioName;
  engineSim.applyScenario(name);
  const alert = evaluateScenario(name);
  const result = await runAlertPipeline(alert);

  res.json({
    ok: true,
    scenario: name,
    telemetry: engineSim.snapshot(),
    alert: result.alert,
    duplicate: result.duplicate,
    sms: result.sms,
  });
});

export default router;
