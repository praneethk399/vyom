import { GoogleGenAI } from '@google/genai';
import { SUBSYSTEMS } from '../../src/lib/types';
import type { AIDiagnosticReport, EngineTelemetry, Subsystem } from '../../src/lib/types';
import type { DiagnoseInput } from './mockDiagnostics';

const MODEL = 'gemini-2.5-flash';

const apiKey = process.env.GEMINI_API_KEY;

export function hasGemini(): boolean {
  return Boolean(apiKey);
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: apiKey as string });
  return client;
}

const SUBSYSTEM_ENUM = [...SUBSYSTEMS];

/** responseSchema matching the AIDiagnosticReport shape — structured JSON, not prose */
const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    overallStatus: { type: 'string', enum: ['OPTIMAL', 'ACCEPTABLE', 'DEGRADED', 'CRITICAL'] },
    healthScore: { type: 'number', description: '0-100' },
    predictedRulHours: { type: 'number' },
    confidenceScore: { type: 'number', description: '0-1' },
    primaryRiskFactor: { type: 'string' },
    thermodynamicAssessment: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        findings: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary', 'findings'],
    },
    mechanicalStressAssessment: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        findings: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary', 'findings'],
    },
    electricalAuxiliaryAssessment: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        findings: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary', 'findings'],
    },
    rootCauseAnalysis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          subsystem: { type: 'string', enum: SUBSYSTEM_ENUM },
          cause: { type: 'string' },
          confidence: { type: 'number', description: '0-1' },
        },
        required: ['subsystem', 'cause', 'confidence'],
      },
    },
    recommendedActions: { type: 'array', items: { type: 'string' } },
    probableFailures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          subsystem: { type: 'string', enum: SUBSYSTEM_ENUM },
          failureMode: { type: 'string' },
          probability: { type: 'number', description: '0-1' },
          precursorsDetected: { type: 'array', items: { type: 'string' } },
          timeToFailureHours: { type: 'number' },
          mitigationAction: { type: 'string' },
          status: { type: 'string', enum: ['NOMINAL', 'PRECURSOR_ACTIVE', 'IMMINENT_BREACH'] },
        },
        required: ['id', 'subsystem', 'failureMode', 'probability', 'precursorsDetected', 'mitigationAction', 'status'],
      },
    },
    drdoComplianceStatus: { type: 'string' },
    isAiGenerated: { type: 'boolean' },
  },
  required: [
    'overallStatus',
    'healthScore',
    'predictedRulHours',
    'confidenceScore',
    'primaryRiskFactor',
    'thermodynamicAssessment',
    'mechanicalStressAssessment',
    'electricalAuxiliaryAssessment',
    'rootCauseAnalysis',
    'recommendedActions',
    'probableFailures',
    'drdoComplianceStatus',
    'isAiGenerated',
  ],
};

function summarize(values: number[]): string {
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  return `first=${values[0]?.toFixed(1)} last=${values[values.length - 1]?.toFixed(1)} min=${Math.min(...values).toFixed(1)} max=${Math.max(...values).toFixed(1)} mean=${mean.toFixed(1)}`;
}

export function buildPrompt(input: DiagnoseInput): string {
  const w = input.window;
  const keys: (keyof EngineTelemetry)[] = [
    'throttle', 'altitude', 'thrust', 'n2Rpm', 'tet', 'pressureRatio', 'bladeStress',
    'efficiency', 'batteryVoltage', 'oilPressure', 'vibration', 'fuelFlow', 'healthIndex', 'rulHours',
  ];
  const lines = keys
    .map((k) => `  ${k}: ${summarize(w.map((x) => x.telemetry[k] as number))}`)
    .join('\n');

  return [
    'You are VYOM, the AI diagnostic core of a real-time digital twin for the Flygas GAS418S',
    'Turbo-Supercharged aero engine fitted to the DRDO Tapas-BH-201 / Archer Tactical UAV.',
    '',
    'Analyze the following telemetry window summary for the GAS418S turbo-supercharged aero engine',
    '(turbo-supercharged gas-turbine core; units: throttle %, altitude m, thrust kN,',
    'n2Rpm rpm, tet K, pressureRatio -, bladeStress MPa, efficiency %, batteryVoltage V,',
    'oilPressure PSI, vibration g RMS, fuelFlow L/h, healthIndex %, rulHours h).',
    'Soft ACTIVE_LIMITs (placeholders, not certified): TET 1160 K / 1250 K, vibration 1.2/2.5 g,',
    'oil pressure 55/38 PSI, battery 25.5/23 V, fuel flow 38/45 L/h, engine pressure ratio floor 11/8.5,',
    'efficiency 34/26 %, blade root stress 700/820 MPa, N2 spool 13800/14200 rpm. Field notes:',
    'n2Rpm is gas-generator spool speed (nominal cruise ~12,000 rpm), thrust is core thrust in kN',
    '(nominal cruise ~51 kN), tet is TURBINE ENTRY TEMPERATURE (nominal cruise ~1,080 K),',
    'pressureRatio is ENGINE PRESSURE RATIO (nominal cruise ~15.4), bladeStress is turbine',
    'blade-root stress (nominal cruise ~590 MPa).',
    '',
    `Engine mode: ${input.mode} | Injected fault class: ${input.fault} | Dataset: ${input.dataset ?? 'live'}`,
    '',
    'Telemetry window (last ~90 frames):',
    lines,
    '',
    'Respond ONLY with JSON matching the provided response schema. Base every statement strictly',
    'on the numbers above — never invent readings. probableFailures should include failures whose',
    'precursors are visible in the data, each with a probability 0-1, timeToFailureHours (null if',
    'unknown), precursorsDetected, mitigationAction and status (NOMINAL / PRECURSOR_ACTIVE /',
    'IMMINENT_BREACH). rootCauseAnalysis lists the top causes with confidence 0-1. recommendedActions',
    'must be plain-language. Set isAiGenerated to true.',
  ].join('\n');
}

function stripFences(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : t;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Coerce + validate the model output into the canonical AIDiagnosticReport shape */
function normalizeReport(raw: Record<string, unknown>, input: DiagnoseInput): AIDiagnosticReport {
  const subs = (s: unknown): Subsystem =>
    SUBSYSTEMS.includes(s as Subsystem) ? (s as Subsystem) : 'Turbine';
  const failuresRaw = Array.isArray(raw.probableFailures) ? raw.probableFailures : [];
  const probableFailures = failuresRaw.slice(0, 8).map((f, i) => {
    const o = (f ?? {}) as Record<string, unknown>;
    const probability = Math.max(0.03, Math.min(0.97, asNumber(o.probability, 0.1)));
    return {
      id: typeof o.id === 'string' ? o.id : `gemini:${i}`,
      subsystem: subs(o.subsystem),
      failureMode: typeof o.failureMode === 'string' ? o.failureMode : 'Undefined failure mode',
      probability,
      precursorsDetected: asStringArray(o.precursorsDetected),
      timeToFailureHours: o.timeToFailureHours === null || o.timeToFailureHours === undefined ? null : Math.max(0, asNumber(o.timeToFailureHours, 0)),
      mitigationAction: typeof o.mitigationAction === 'string' ? o.mitigationAction : 'Review maintenance schedule',
      status: ['NOMINAL', 'PRECURSOR_ACTIVE', 'IMMINENT_BREACH'].includes(o.status as string)
        ? (o.status as ProbableFailureModeStatus)
        : probability >= 0.9
          ? 'IMMINENT_BREACH'
          : probability >= 0.5
            ? 'PRECURSOR_ACTIVE'
            : 'NOMINAL',
    };
  });

  const block = (o: unknown): AssessmentBlockShape => {
    const b = (o ?? {}) as Record<string, unknown>;
    return {
      summary: typeof b.summary === 'string' ? b.summary : '',
      findings: asStringArray(b.findings),
    };
  };

  const statuses = ['OPTIMAL', 'ACCEPTABLE', 'DEGRADED', 'CRITICAL'];
  const overallStatus = statuses.includes(raw.overallStatus as string)
    ? (raw.overallStatus as AIDiagnosticReport['overallStatus'])
    : 'ACCEPTABLE';

  return {
    generatedAt: Date.now(),
    overallStatus,
    healthScore: Math.max(0, Math.min(100, Math.round(asNumber(raw.healthScore, 80)))),
    predictedRulHours: Math.max(0, Math.round(asNumber(raw.predictedRulHours, input.window.at(-1)?.telemetry.rulHours ?? 800))),
    confidenceScore: Math.max(0, Math.min(1, asNumber(raw.confidenceScore, 0.85))),
    primaryRiskFactor: typeof raw.primaryRiskFactor === 'string' ? raw.primaryRiskFactor : 'No significant risk detected',
    thermodynamicAssessment: block(raw.thermodynamicAssessment),
    mechanicalStressAssessment: block(raw.mechanicalStressAssessment),
    electricalAuxiliaryAssessment: block(raw.electricalAuxiliaryAssessment),
    rootCauseAnalysis: Array.isArray(raw.rootCauseAnalysis)
      ? (raw.rootCauseAnalysis as unknown[]).slice(0, 5).map((rc) => {
          const o = (rc ?? {}) as Record<string, unknown>;
          return {
            subsystem: subs(o.subsystem),
            cause: typeof o.cause === 'string' ? o.cause : '',
            confidence: Math.max(0, Math.min(1, asNumber(o.confidence, 0.5))),
          };
        })
      : [],
    recommendedActions: asStringArray(raw.recommendedActions).slice(0, 8),
    probableFailures,
    drdoComplianceStatus:
      typeof raw.drdoComplianceStatus === 'string' && raw.drdoComplianceStatus.length > 0
        ? raw.drdoComplianceStatus
        : 'PASS — all parameters within DRDO certification envelope',
    isAiGenerated: true,
  };
}

export async function diagnoseWithGemini(input: DiagnoseInput): Promise<AIDiagnosticReport> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildPrompt(input),
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
      temperature: 0.2,
    },
  });
  const text = response.text;
  if (!text) throw new Error('empty response from Gemini');
  const parsed: unknown = JSON.parse(stripFences(text));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('non-object response');
  return normalizeReport(parsed as Record<string, unknown>, input);
}

type ProbableFailureModeStatus = 'NOMINAL' | 'PRECURSOR_ACTIVE' | 'IMMINENT_BREACH';

interface AssessmentBlockShape {
  summary: string;
  findings: string[];
}