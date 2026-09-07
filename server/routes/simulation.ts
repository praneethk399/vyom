import { Router } from 'express';
import { applyScenario } from '../services/simulationService';
import { validateScenario } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { rateLimit } from '../middleware/validation';

/**
 * POST /api/simulation/scenario { scenario }
 * Applies the scenario through the simulation service (telemetry → alert
 * engine → storage → SMS) and returns the authoritative telemetry + alert.
 */
const router = Router();

router.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 60 }),
  asyncHandler(async (req, res) => {
    const scenario = validateScenario((req.body as { scenario?: unknown } | undefined)?.scenario);
    if (!scenario) {
      res.status(400).json({
        ok: false,
        error: 'invalid scenario — expected one of: nominal, tet_runaway, vibration_growth, oil_pressure_loss, compressor_surge, fuel_flow_anomaly, battery_sag',
      });
      return;
    }
    res.json(await applyScenario(scenario));
  }),
);

export default router;