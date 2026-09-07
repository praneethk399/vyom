import { describe, expect, it, vi, beforeEach } from 'vitest';
import { addAlert, sendAlertSMS, type ScenarioAlert } from '../src/features/alerts/scenarioAlerts';
import { useAlertStore } from '../src/state/alertStore';

function alert(over: Partial<ScenarioAlert> & { alertType: string }): ScenarioAlert {
  return {
    severity: 'CRITICAL',
    engineId: 'GAS418S',
    timestamp: new Date().toISOString(),
    scenario: 'TET_RUNWAY',
    value: 1260,
    threshold: 1250,
    ...over,
  };
}

describe('scenario alert SMS pipeline', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    useAlertStore.setState({ alerts: [] });
  });

  it('NORMAL never reaches the SMS service and is tagged not-required', async () => {
    const a = alert({ alertType: 'SYSTEM_NOMINAL', severity: 'NORMAL', id: 'scen:n1' });
    addAlert(a);
    const outcome = await sendAlertSMS(a);
    expect(outcome).toBe('not-required');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAlertStore.getState().alerts[0].sms).toBe('not-required');
  });

  it('WARNING and CRITICAL POST to /api/alerts and tag the feed entry', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, sms: 'sent' }) });
    const a = alert({ alertType: 'BATTERY_SAG', severity: 'WARNING', id: 'scen:w1' });
    addAlert(a);
    await expect(sendAlertSMS(a)).resolves.toBe('sent');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/alerts');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).severity).toBe('WARNING');
    expect(useAlertStore.getState().alerts[0].sms).toBe('sent');
  });

  it('suppresses the same alertType + engine within 5 minutes (one POST)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, sms: 'sent' }) });
    const a = alert({ alertType: 'TET_RUNAWAY', id: 'scen:t1' });
    addAlert(a);
    await sendAlertSMS(a); // first — sends
    const b = alert({ alertType: 'TET_RUNAWAY', id: 'scen:t2' }); // re-click seconds later
    addAlert(b);
    await expect(sendAlertSMS(b)).resolves.toBe('not-required');
    expect(fetchMock).toHaveBeenCalledTimes(1); // duplicate never POSTed
    expect(useAlertStore.getState().alerts[0].sms).toBe('not-required');
  });

  it('server rejection maps to failed', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ ok: false }) });
    const a = alert({ alertType: 'OIL_PRESSURE_LOSS', id: 'scen:o1' });
    addAlert(a);
    await expect(sendAlertSMS(a)).resolves.toBe('failed');
    expect(useAlertStore.getState().alerts[0].sms).toBe('failed');
  });
});
