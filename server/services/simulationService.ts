import { telemetryService } from './telemetryService';
import { evaluateScenario, processAlert } from './alertEngine';
import type { ScenarioName } from '../models/telemetry';
import type { EngineSnapshot } from '../models/telemetry';
import type { AlertPipelineResult } from './alertEngine';

export interface ScenarioResult {
  ok: boolean;
  scenario: ScenarioName;
  telemetry: EngineSnapshot;
  alert: AlertPipelineResult['alert'];
  duplicate: boolean;
  sms: AlertPipelineResult['sms'];
}

/**
 * Simulation service — the business flow for POST /api/simulation/scenario:
 * apply the scenario to the engine telemetry, evaluate it through the alert
 * engine, record + SMS it, and return the authoritative result for the client
 * to adopt. Route handlers stay thin; the logic lives here.
 */
export async function applyScenario(scenario: ScenarioName): Promise<ScenarioResult> {
  const telemetry = telemetryService.applyScenario(scenario);
  const alert = evaluateScenario(scenario);
  const result = await processAlert(alert);

  return {
    ok: true,
    scenario,
    telemetry,
    alert: result.alert,
    duplicate: result.duplicate,
    sms: result.sms,
  };
}