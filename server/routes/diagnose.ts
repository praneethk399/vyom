import { Router } from 'express';
import { diagnoseWithGemini, hasGemini } from '../lib/gemini';
import { buildMockReport, validateDiagnoseInput, type DiagnoseInput } from '../lib/mockDiagnostics';

const router = Router();

/**
 * POST /api/diagnose — body: { window: {ts, telemetry}[], fault, mode, dataset }
 * Returns { report: AIDiagnosticReport, engine: 'gemini' | 'rule-based' }.
 * If Gemini is unavailable, errors or rate-limits, the route falls back to the
 * deterministic rule-based report so the diagnostics panel is never blocked.
 */
router.post('/', async (req, res) => {
  const parsed = validateDiagnoseInput(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const input: DiagnoseInput = parsed.input;
  if (input.window.length > 600) input.window = input.window.slice(-600); // ring max

  // Express 4 does not forward async rejections — without this catch a throw
  // in the report builders kills the whole API process for every client.
  try {
    if (hasGemini()) {
      try {
        const report = await diagnoseWithGemini(input);
        res.json({ report, engine: 'gemini' });
        return;
      } catch (err) {
        console.error('[diagnose:gemini]', err instanceof Error ? err.message : err);
        const report = buildMockReport(input);
        res.json({ report, engine: 'rule-based', degraded: true });
        return;
      }
    }

    const report = buildMockReport(input);
    res.json({ report, engine: 'rule-based' });
  } catch (err) {
    console.error('[diagnose]', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: 'diagnose failed' });
  }
});

export default router;