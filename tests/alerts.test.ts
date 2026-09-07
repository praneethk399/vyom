import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'http';
import { buildApp } from '../server/app';
import { engineSim } from '../server/lib/engineSim';
import { evaluateScenario } from '../server/lib/alertEngine';
import { formatSmsMessage, sendAlertSms } from '../server/lib/sms';
import { markSmsSent, smsDuplicate } from '../server/lib/alertStore';

// ---------------------------------------------------------------------------
// Pure units — alert engine + SMS formatting + dedup primitives
// ---------------------------------------------------------------------------

describe('alert engine', () => {
  it('maps each fault scenario to its alertType and severity', () => {
    const expectations: Array<[Parameters<typeof evaluateScenario>[0], string, string]> = [
      ['tet_runaway', 'TET_RUNAWAY', 'CRITICAL'],
      ['vibration_growth', 'VIBRATION_LIMIT_BREACH', 'CRITICAL'],
      ['oil_pressure_loss', 'OIL_PRESSURE_LOSS', 'CRITICAL'],
      ['compressor_surge', 'COMPRESSOR_SURGE', 'CRITICAL'],
      ['fuel_flow_anomaly', 'FUEL_FLOW_ANOMALY', 'WARNING'],
      ['battery_sag', 'BATTERY_SAG', 'WARNING'],
    ];
    for (const [scenario, alertType, severity] of expectations) {
      engineSim.applyScenario(scenario);
      const a = evaluateScenario(scenario);
      expect(a.alertType, scenario).toBe(alertType);
      expect(a.severity, scenario).toBe(severity);
      expect(a.engineId).toBe('GAS418S');
      expect(a.scenario).toBe(scenario);
    }
  });

  it('captures live values/thresholds and nominal yields a NORMAL system alert', () => {
    engineSim.applyScenario('vibration_growth');
    const vib = evaluateScenario('vibration_growth');
    expect(vib.value).toBeCloseTo(2.87);
    expect(vib.threshold).toBe(2.5);

    engineSim.applyScenario('nominal');
    const n = evaluateScenario('nominal');
    expect(n.alertType).toBe('SYSTEM_NOMINAL');
    expect(n.severity).toBe('NORMAL');
    expect(n.sms).toBeUndefined();
  });
});

describe('SMS message formatting', () => {
  const base = { engineId: 'GAS418S', timestamp: new Date().toISOString(), scenario: 'vibration_growth' };

  it('emits fault-specific copy per alert type', () => {
    expect(formatSmsMessage({ ...base, alertType: 'TET_RUNAWAY', severity: 'CRITICAL' })).toContain('TET runaway detected');
    expect(formatSmsMessage({ ...base, alertType: 'OIL_PRESSURE_LOSS', severity: 'CRITICAL' })).toContain('oil pressure loss');
    expect(formatSmsMessage({ ...base, alertType: 'COMPRESSOR_SURGE', severity: 'CRITICAL' })).toContain('compressor surge');
    expect(formatSmsMessage({ ...base, alertType: 'FUEL_FLOW_ANOMALY', severity: 'WARNING' })).toBe('VYOM WARNING: GAS418S abnormal fuel-flow detected. Inspection recommended.');
    expect(formatSmsMessage({ ...base, alertType: 'BATTERY_SAG', severity: 'WARNING' })).toBe('VYOM WARNING: GAS418S battery sag detected. Check engine power system.');
  });

  it('interpolates current value and threshold for vibration', () => {
    const msg = formatSmsMessage({ ...base, alertType: 'VIBRATION_LIMIT_BREACH', severity: 'CRITICAL', value: 2.87, threshold: 2.5 });
    expect(msg).toContain('Current vibration: 2.87 RMS. Threshold: 2.50 RMS.');
  });
});

describe('SMS service', () => {
  const fetchMock = vi.fn();

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('never sends for NORMAL and does not throw with no key (dev-test mode)', async () => {
    vi.stubEnv('FAST2SMS_API_KEY', '');
    vi.stubGlobal('fetch', fetchMock);
    const out = await sendAlertSms({
      alertType: 'SYSTEM_NOMINAL', severity: 'NORMAL', engineId: 'GAS418S', timestamp: '', scenario: 'nominal',
    });
    expect(out.sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid phone number without calling the provider', async () => {
    vi.stubEnv('FAST2SMS_API_KEY', 'key-123');
    vi.stubEnv('ALERT_PHONE_NUMBER', 'not-a-phone');
    fetchMock.mockReset();
    const out = await sendAlertSms({
      alertType: 'TET_RUNAWAY', severity: 'CRITICAL', engineId: 'GAS418S', timestamp: '', scenario: 'tet_runaway',
    });
    expect(out.sent).toBe(false);
    expect(out.mode).toBe('fast2sms');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to Fast2SMS when configured and reports provider failure without throwing', async () => {
    vi.stubEnv('FAST2SMS_API_KEY', 'key-123');
    vi.stubEnv('ALERT_PHONE_NUMBER', '+919999999999');
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ return: false }) });
    const failed = await sendAlertSms({
      alertType: 'BATTERY_SAG', severity: 'WARNING', engineId: 'GAS418S', timestamp: '', scenario: 'battery_sag',
    });
    expect(failed.sent).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('fast2sms.com');

    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ return: true }) });
    const ok = await sendAlertSms({
      alertType: 'FUEL_FLOW_ANOMALY', severity: 'WARNING', engineId: 'GAS418S', timestamp: '', scenario: 'fuel_flow_anomaly',
    });
    expect(ok.sent).toBe(true);
    expect(ok.mode).toBe('fast2sms');
  });
});

describe('dedup primitives', () => {
  it('suppresses the same alertType + engine within 5 minutes', () => {
    markSmsSent('TET_RUNAWAY', 'GAS418S');
    expect(smsDuplicate('TET_RUNAWAY', 'GAS418S')).toBe(true);
    expect(smsDuplicate('TET_RUNAWAY', 'OTHER')).toBe(false);
    expect(smsDuplicate('BATTERY_SAG', 'GAS418S')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HTTP integration — the real Express app on an ephemeral port
// ---------------------------------------------------------------------------

describe('VYOM backend API', () => {
  let server: Server;
  let base = '';

  beforeAll(async () => {
    server = buildApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const addr = server.address();
    if (addr && typeof addr === 'object') base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('GET /api/telemetry returns the engine snapshot shape', async () => {
    const res = await fetch(`${base}/api/telemetry`);
    expect(res.status).toBe(200);
    const t = (await res.json()) as Record<string, unknown>;
    expect(t.engineId).toBe('GAS418S');
    for (const k of ['rpm', 'tet', 'thrust', 'oilPressure', 'vibration', 'fuelFlow', 'battery', 'health', 'predictedRUL', 'missionStatus', 'timestamp']) {
      expect(t, k).toHaveProperty(k);
    }
  });

  it('POST /api/simulation/scenario drives scenario → alert → history', async () => {
    // nominal → NORMAL, never SMS
    const nom = await post('/api/simulation/scenario', { scenario: 'nominal' });
    expect(nom.status).toBe(200);
    const nomBody = await nom.json();
    expect(nomBody.alert.severity).toBe('NORMAL');
    expect(nomBody.alert.alertType).toBe('SYSTEM_NOMINAL');
    expect(nomBody.sms).toBe('not-required');

    // battery_sag → WARNING
    const bat = await post('/api/simulation/scenario', { scenario: 'battery_sag' });
    const batBody = await bat.json();
    expect(batBody.alert.severity).toBe('WARNING');
    expect(batBody.alert.alertType).toBe('BATTERY_SAG');
    expect(batBody.sms).toBe('sent'); // dev-test mode (no FAST2SMS_API_KEY)
    expect(batBody.telemetry.battery).toBeCloseTo(22.4);

    // vibration_growth → CRITICAL, live value 2.87
    const vib = await post('/api/simulation/scenario', { scenario: 'vibration_growth' });
    const vibBody = await vib.json();
    expect(vibBody.alert.alertType).toBe('VIBRATION_LIMIT_BREACH');
    expect(vibBody.alert.severity).toBe('CRITICAL');
    expect(vibBody.alert.value).toBeCloseTo(2.87);
    expect(vibBody.sms).toBe('sent');
    expect(vibBody.telemetry.vibration).toBeCloseTo(2.87);
    expect(vibBody.telemetry.missionStatus).toBe('ENV RESTRICT');
  });

  it('suppresses duplicate SMS for the same scenario within 5 minutes', async () => {
    const dup = await post('/api/simulation/scenario', { scenario: 'vibration_growth' });
    const body = await dup.json();
    expect(body.duplicate).toBe(true);
    expect(body.sms).toBe('not-required');
    expect(body.alert.sms).toBe('not-required');
  });

  it('rejects unknown scenarios with 400', async () => {
    const res = await post('/api/simulation/scenario', { scenario: 'explode' });
    expect(res.status).toBe(400);
  });

  it('GET /api/alerts returns recorded history', async () => {
    const res = await fetch(`${base}/api/alerts`);
    expect(res.status).toBe(200);
    const { alerts } = (await res.json()) as { alerts: Array<{ alertType: string; sms?: string; severity: string }> };
    expect(alerts.length).toBeGreaterThanOrEqual(3);
    expect(alerts[0].alertType).toBe('VIBRATION_LIMIT_BREACH');
    expect(alerts.some((a) => a.sms === 'not-required')).toBe(true);
  });

  it('POST /api/test/critical-alert runs the full dev pipeline', async () => {
    const res = await post('/api/test/critical-alert', {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dev).toBe(true);
    expect(body.alert.alertType).toBe('VIBRATION_LIMIT_BREACH');
    expect(body.alert.severity).toBe('CRITICAL');
    expect(body.sms).toBeDefined();
  });

  it('POST /api/alerts validates, stores, dedups and SMS-es', async () => {
    const bad = await post('/api/alerts', { nope: 1 });
    expect(bad.status).toBe(400);

    const good = await post('/api/alerts', {
      alertType: 'OIL_PRESSURE_LOSS', severity: 'CRITICAL', engineId: 'GAS418S',
      parameter: 'oilPressure', value: 34, threshold: 38, scenario: 'oil_pressure_loss',
      timestamp: new Date().toISOString(),
    });
    const goodBody = await good.json();
    expect(goodBody.ok).toBe(true);
    expect(goodBody.sms).toBe('sent');

    const dup = await post('/api/alerts', {
      alertType: 'OIL_PRESSURE_LOSS', severity: 'CRITICAL', engineId: 'GAS418S',
      parameter: 'oilPressure', value: 33, threshold: 38, scenario: 'oil_pressure_loss',
      timestamp: new Date().toISOString(),
    });
    const dupBody = await dup.json();
    expect(dupBody.duplicate).toBe(true);
    expect(dupBody.sms).toBe('not-required');
  });
});
