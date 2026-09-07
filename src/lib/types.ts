// ---------------------------------------------------------------------------
// VYOM canonical contracts — the schema is the source of truth. Field names
// and values here are used verbatim everywhere (UI, stores, server, AI schema).
// ---------------------------------------------------------------------------

export type Severity = 'nominal' | 'caution' | 'warning' | 'critical';

export type EngineMode = 'LIVE_SIM' | 'DATASET_REPLAY';

export type OverlayMode = 'thermal' | 'stress';

export type AlertCategory = 'PREDICTIVE_PRECURSOR' | 'ACTIVE_LIMIT' | 'SYSTEM_ADVISORY';

export type AlertSource = 'threshold' | 'ai' | 'system';

export const SUBSYSTEMS = [
  'Turbine',
  'Compressor',
  'Bearings & Shaft',
  'Electrical',
  'Combustor',
  'Fuel System',
] as const;

export type Subsystem = (typeof SUBSYSTEMS)[number];

export type FailureStatus = 'NOMINAL' | 'PRECURSOR_ACTIVE' | 'IMMINENT_BREACH';

export type ComponentCondition = 'EXCELLENT' | 'GOOD' | 'MONITOR' | 'ACTION_REQUIRED';

export type OverallStatus = 'OPTIMAL' | 'ACCEPTABLE' | 'DEGRADED' | 'CRITICAL';

/** The four Brayton-cycle states: compressor inlet -> outlet -> turbine inlet -> outlet */
export interface EntropyPoints {
  s: number[]; // kJ/(kg·K)
  t: number[]; // K
}

export interface EngineTelemetry {
  throttle: number; // PLA %
  altitude: number; // m
  thrust: number; // kN
  n2Rpm: number;
  tet: number; // K
  pressureRatio: number;
  bladeStress: number; // MPa
  efficiency: number; // %
  batteryVoltage: number; // V
  oilPressure: number; // PSI
  vibration: number; // g RMS
  fuelFlow: number; // L/h
  healthIndex: number; // %
  rulHours: number;
  entropyPoints: EntropyPoints;
}

export type TelemetrySource = 'LIVE_SIM' | 'DATASET_REPLAY';

export interface TelemetryFrame {
  id: number;
  ts: number; // epoch ms
  source: TelemetrySource;
  telemetry: EngineTelemetry;
}

export interface AlertNotification {
  id: string;
  ts: number;
  severity: Severity;
  category: AlertCategory;
  title: string;
  message: string;
  parameter?: string;
  source: AlertSource;
  acknowledged: boolean;
}

export interface ProbableFailureMode {
  id: string;
  subsystem: Subsystem;
  failureMode: string;
  probability: number; // 0..1
  precursorsDetected: string[];
  timeToFailureHours: number | null;
  mitigationAction: string;
  status: FailureStatus;
}

export interface ComponentRul {
  id: string;
  name: string;
  rulHours: number;
  nominalTboHours: number;
  wearPercentage: number; // 0..100
  lifingModel: string;
  condition: ComponentCondition;
  recommendation: string;
}

export interface AssessmentBlock {
  summary: string;
  findings: string[];
}

export interface RootCause {
  subsystem: Subsystem;
  cause: string;
  confidence: number; // 0..1
}

export interface AIDiagnosticReport {
  generatedAt: number;
  overallStatus: OverallStatus;
  healthScore: number; // 0..100
  predictedRulHours: number;
  confidenceScore: number; // 0..1
  primaryRiskFactor: string;
  thermodynamicAssessment: AssessmentBlock;
  mechanicalStressAssessment: AssessmentBlock;
  electricalAuxiliaryAssessment: AssessmentBlock;
  rootCauseAnalysis: RootCause[];
  recommendedActions: string[];
  probableFailures: ProbableFailureMode[];
  drdoComplianceStatus: string;
  isAiGenerated: boolean;
}

export type AiEngine = 'gemini' | 'rule-based';

export interface DiagnoseResponse {
  report: AIDiagnosticReport;
  engine: AiEngine;
}

export interface FlightDatasetMeta {
  id: string;
  missionId: string;
  name: string;
  description: string;
  conditions: string;
  samplingRateHz: number;
  durationSec: number;
  frameCount: number;
  startTime: string;
  reliability: {
    grade: 'A' | 'B' | 'C';
    completionPct: number;
    directive: string;
    faultsLogged: number;
  };
}

export interface FlightDataset extends FlightDatasetMeta {
  frames: EngineTelemetry[];
}

export type FaultClass =
  | 'NORMAL'
  | 'TET_RUNWAY'
  | 'VIBRATION_GROWTH'
  | 'OIL_PRESSURE_LOSS'
  | 'COMPRESSOR_STALL'
  | 'FUEL_FLOW_ANOMALY'
  | 'BATTERY_SAG';

export type MissionLogType = 'MODE' | 'DATASET' | 'FAULT' | 'LINK' | 'AI_PRECURSOR' | 'LIMIT' | 'SYSTEM';

export interface MissionLogEntry {
  id: string;
  ts: number;
  type: MissionLogType;
  message: string;
  severity: Severity;
}