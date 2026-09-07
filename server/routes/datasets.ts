import { Router } from 'express';
import { getAllDatasets, getDatasetById } from '../lib/datasets';

const router = Router();

/** metadata list — no frames, keeps the picker light */
router.get('/', (_req, res) => {
  const list = getAllDatasets().map((d) => ({
    id: d.id,
    missionId: d.missionId,
    name: d.name,
    description: d.description,
    conditions: d.conditions,
    samplingRateHz: d.samplingRateHz,
    durationSec: d.durationSec,
    frameCount: d.frameCount,
    startTime: d.startTime,
    reliability: d.reliability,
  }));
  res.json(list);
});

router.get('/:id', (req, res) => {
  const ds = getDatasetById(req.params.id);
  if (!ds) {
    res.status(404).json({ error: 'dataset not found' });
    return;
  }
  res.json(ds);
});

export default router;