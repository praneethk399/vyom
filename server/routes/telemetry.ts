import { Router } from 'express';
import { engineSim } from '../lib/engineSim';

/** GET /api/telemetry — current simulated engine state (scenario-aware). */
const router = Router();

router.get('/', (_req, res) => {
  res.json(engineSim.snapshot());
});

export default router;
