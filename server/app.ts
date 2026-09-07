import express from 'express';
import cors from 'cors';
import datasetsRouter from './routes/datasets';
import diagnoseRouter from './routes/diagnose';
import alertsRouter, { testRouter } from './routes/alerts';
import telemetryRouter from './routes/telemetry';
import simulationRouter from './routes/simulation';
import { notFound, errorHandler } from './middleware/errorHandler';

export function buildApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'vyom', time: Date.now() });
  });

  app.use('/api/datasets', datasetsRouter);
  app.use('/api/diagnose', diagnoseRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/telemetry', telemetryRouter);
  app.use('/api/simulation/scenario', simulationRouter);
  app.use('/api/test/critical-alert', testRouter);

  // Centralized error handling — unknown routes and thrown/rejected handlers
  // become JSON responses; the process never dies from a bad request or a
  // failing dependency (e.g. SMS provider).
  app.use(notFound);
  app.use(errorHandler);

  return app;
}