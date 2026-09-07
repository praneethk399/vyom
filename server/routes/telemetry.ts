import { Router } from 'express';
import { telemetryService } from '../services/telemetryService';
import { asyncHandler } from '../middleware/errorHandler';

/** GET /api/telemetry — current simulated engine state. */
const router = Router();

router.get(
  '/',
  asyncHandler((_req, res) => {
    res.json(telemetryService.snapshot());
  }),
);

export default router;