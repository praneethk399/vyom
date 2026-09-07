/**
 * Adversarial lifecycle drive of the recalibrated telemetry stack — no React,
 * no DOM: imports the real stores/generators/thresholds and asserts the state
 * transitions end-to-end.
 *
 * Run: npx tsx scripts/verify-lifecycle.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LiveSimulator } from '../src/features/telemetry/liveSim';
import { useTelemetryStore } from '../src/state/telemetryStore';
import { useAlertStore } from '../src/state/alertStore';
import { evaluateFrame } from '../src/lib/thresholds';
import { ingestFrame } from '../src/features/telemetry/useTelemetryEngine';
import { buildDataset, type DatasetSpec } from '../server/lib/datasets';
import type { EngineTelemetry } from '../src/lib/types';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Replay lifecycle: load -> play -> complete -> restart (the ScrubBar fix)
// ---------------------------------------------------------------------------
console.log('1. replay lifecycle');
{
  const raw = JSON.parse(
    readFileSync(fileURLToPath(new URL('../server/data/drdo-cruise-01.json', import.meta.url)), 'utf-8'),
  ) as { id: string; name: string; description: string; samplingRateHz: number; durationSeconds: number; frames: (EngineTelemetry & { timestamp: number })[] };
  const startTime = new Date(raw.frames[0].timestamp).toISOString();
  const ds = {
    id: raw.id,
    missionId: 'M-01',
    name: raw.name,
    description: raw.description,
    conditions: '',
    samplingRateHz: raw.samplingRateHz,
    durationSec: raw.durationSeconds,
    frameCount: raw.frames.length,
    startTime,
    reliability: { grade: 'A' as const, completionPct: 100, directive: 'TEST', faultsLogged: 0 },
    frames: raw.frames.map(({ timestamp: _t, ...f }) => ({ ...f })),
  };

  const tel = useTelemetryStore.getState();
  // Pre-pollute the stream so loadDataset's own reset is what's under test:
  // a dataset switch must clear the previous capture's ring + limitState.
  tel.pushFrame(
    { throttle: 10, altitude: 0, thrust: 0, n2Rpm: 0, tet: 300, pressureRatio: 0, bladeStress: 0, efficiency: 0, batteryVoltage: 0, oilPressure: 0, vibration: 0, fuelFlow: 0, healthIndex: 0, rulHours: 0, entropyPoints: { s1: 0, s2: 0, s3: 0, s4: 0, t1: 0, t2: 0, t3: 0, t4: 0 } },
    'LIVE_SIM',
  );
  useTelemetryStore.setState({ limitState: { tet: 'warning' } });
  tel.loadDataset(ds);
  const s0 = useTelemetryStore.getState();
  check('loadDataset arms frame 0', s0.frame !== null && s0.replayIndex === 0 && s0.replayPlaying === true);
  check('switch cleared previous capture (ring + limitState)', s0.ring.length === 1 && Object.keys(s0.limitState).length === 0, `ring=${s0.ring.length} limits=${JSON.stringify(s0.limitState)}`);

  // step to completion the way the replay loop does (pushFrame+setReplayIndex)
  for (let i = 1; i < s0.frames.length; i++) {
    const s = useTelemetryStore.getState();
    if (s.replayIndex >= s.frames.length - 1) break;
    const { alerts, nextLimitState } = evaluateFrame(s.frames[s.replayIndex + 1], s.limitState);
    s.pushFrame(s.frames[s.replayIndex + 1], 'DATASET_REPLAY');
    s.setReplayIndex(s.replayIndex + 1);
    useTelemetryStore.setState({ limitState: nextLimitState });
    if (alerts.length > 0) useAlertStore.getState().pushAlerts(alerts);
  }
  const s1 = useTelemetryStore.getState();
  check('played to last frame', s1.replayIndex === s1.frames.length - 1, `index=${s1.replayIndex}/${s1.frames.length - 1}`);
  check('60-frame capture ingested into ring', s1.ring.length === 60, `ring=${s1.ring.length}`);

  // at-end play press: old code re-fired completion; new code must restart via scrubTo(0)
  const before = useTelemetryStore.getState().replayIndex;
  const atEnd = before >= useTelemetryStore.getState().frames.length - 1;
  check('sanity: replay is at end', atEnd);
  // emulate ScrubBar's restart branch (resetStream -> scrubTo(0) -> play)
  useTelemetryStore.getState().resetStream();
  useTelemetryStore.getState().scrubTo(0);
  useTelemetryStore.getState().setPlaying(true);
  const s2 = useTelemetryStore.getState();
  check('at-end play restarts from frame 0', s2.replayIndex === 0 && s2.replayPlaying === true, `index=${s2.replayIndex}`);
  check('restart cleared ring (fresh trend window)', s2.ring.length <= 1, `ring=${s2.ring.length}`);
  check('restart cleared limitState', Object.keys(s2.limitState).length === 0);
}

// ---------------------------------------------------------------------------
// 2. Fault ladder through the REAL ingest path (ingestFrame -> alerts)
// ---------------------------------------------------------------------------
console.log('2. fault ladder via ingestFrame');
{
  useTelemetryStore.getState().resetStream();
  useAlertStore.getState().clear();
  const sim = new LiveSimulator(20260);
  sim.setFault('TET_RUNWAY');
  let warningAt = -1;
  let criticalAt = -1;
  for (let i = 0; i < 900; i++) {
    ingestFrame(sim.advance(0.1), 'LIVE_SIM');
    const alerts = useAlertStore.getState().alerts;
    if (warningAt < 0 && alerts.some((a) => a.parameter === 'tet' && a.severity === 'warning')) warningAt = i;
    if (criticalAt < 0 && alerts.some((a) => a.parameter === 'tet' && a.severity === 'critical')) criticalAt = i;
  }
  check('TET runway raises warning then critical', warningAt >= 0 && criticalAt >= 0, `w=${warningAt} c=${criticalAt}`);
  check('escalation order holds (warning before critical)', warningAt < criticalAt);
  check('frame + ring advanced through ingestFrame', useTelemetryStore.getState().ring.length > 100);
  const health = useTelemetryStore.getState().frame?.healthIndex ?? 100;
  check('health burned under fault', health < 66, `health=${health}`);

  // recovery: clearing the fault must de-escalate silently and burn no health
  useAlertStore.getState().clear();
  sim.setFault('NORMAL');
  for (let i = 0; i < 900; i++) ingestFrame(sim.advance(0.1), 'LIVE_SIM');
  const post = useTelemetryStore.getState();
  check('recovered TET back under soft limit', (post.frame?.tet ?? 9999) < 1160, `tet=${post.frame?.tet}`);
  check(
    'no new TET alerts after recovery (silent de-escalation)',
    !useAlertStore.getState().alerts.some((a) => a.parameter === 'tet'),
  );
}

// ---------------------------------------------------------------------------
// 3. Message formatting regression (the 1257.3267831175451 K bug)
// ---------------------------------------------------------------------------
console.log('3. alert message formatting');
{
  const s = useTelemetryStore.getState();
  const base = s.frame ?? s.frames[s.frames.length - 1];
  const frame: EngineTelemetry = { ...(base as EngineTelemetry), tet: 1257.3267831175451, pressureRatio: 8.612345678 };
  const { alerts } = evaluateFrame(frame, {}, 12345);
  const tet = alerts.find((a) => a.parameter === 'tet');
  const epr = alerts.find((a) => a.parameter === 'pressureRatio');
  check('TET critical message has no float noise', !!tet && !tet.message.includes('1257.3267'), tet?.message);
  check('EPR message formats to 2 dp', !!epr && /\d\.\d{2} :1$/.test(epr.message), epr?.message);
}

// ---------------------------------------------------------------------------
// 4. limitState bookkeeping: escalation, persistence, cleanup
// ---------------------------------------------------------------------------
console.log('4. limitState bookkeeping');
{
  const f: EngineTelemetry = {
    ...(useTelemetryStore.getState().frame as EngineTelemetry),
    tet: 1300,
    oilPressure: 30,
  };
  const first = evaluateFrame(f, {});
  check('two params breach -> two alerts', first.alerts.length === 2, `${first.alerts.length}`);
  check('limitState records both', first.nextLimitState.tet === 'critical' && first.nextLimitState.oilPressure === 'critical');
  const again = evaluateFrame(f, first.nextLimitState);
  check('same-severity frame is silent', again.alerts.length === 0);
  const healthyFrame = { ...f, tet: 1080, oilPressure: 70.5 };
  const cleared = evaluateFrame(healthyFrame, first.nextLimitState);
  check('recovery empties limitState', Object.keys(cleared.nextLimitState).length === 0, JSON.stringify(cleared.nextLimitState));
  check('recovery raises no alerts', cleared.alerts.length === 0);
}

// ---------------------------------------------------------------------------
// 5. Generated M-02 spec respects its mission log (faultsLogged: 1, no criticals)
// ---------------------------------------------------------------------------
console.log('5. M-02 segment band');
{
  const spec: DatasetSpec = {
    id: 'drdo-mission-02',
    missionId: 'M-02',
    name: 't',
    description: '',
    conditions: '',
    samplingRateHz: 10,
    startTime: '2026-01-01T00:00:00Z',
    healthStart: 66.3,
    rulStart: 1249,
    reliability: { grade: 'B', completionPct: 88, directive: 'DASH', faultsLogged: 1 },
    segments: [
      { durSec: 25, throttle: 74, altitude: 4800, drive: { tetBoost: 15 } },
      { durSec: 70, throttle: 78, altitude: 4100, ramp: [{ param: 'tetBoost', to: 40 }, { param: 'vibeBoost', to: 0.2 }] },
      { durSec: 90, throttle: 72, altitude: 5000 },
      { durSec: 80, throttle: 74, altitude: 4900, ramp: [{ param: 'vibeBoost', to: 1.35 }, { param: 'stressBoost', to: 140 }, { param: 'tetBoost', to: 30 }] },
      { durSec: 50, throttle: 58, altitude: 4700 },
    ],
  };
  const ds = buildDataset(spec);
  let state = {};
  let criticals = 0;
  let warnings = 0;
  for (const f of ds.frames) {
    const { alerts, nextLimitState } = evaluateFrame(f, state);
    criticals += alerts.filter((a) => a.severity === 'critical').length;
    warnings += alerts.filter((a) => a.severity === 'warning').length;
    state = nextLimitState;
  }
  check('M-02 produces zero critical breaches', criticals === 0, `${criticals}`);
  check('M-02 still produces the logged excursion (warnings exist)', warnings > 0, `${warnings}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
