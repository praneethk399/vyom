import express from 'express';
import cors from 'cors';
import datasetsRouter from './routes/datasets';
import diagnoseRouter from './routes/diagnose';
import alertsRouter from './routes/alerts';

const rawPort = Number(process.env.PORT ?? 3001);
const PORT = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 3001;

const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'vyom', time: Date.now() });
});

app.use('/api/datasets', datasetsRouter);
app.use('/api/diagnose', diagnoseRouter);
app.use('/api/alerts', alertsRouter);

app.listen(PORT, () => {
  console.log(`[vyom] server listening on http://localhost:${PORT}`);
});