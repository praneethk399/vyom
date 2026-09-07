import rawModel from './aiModel.json';
import type { EngineTelemetry } from './types';
import { NOMINAL } from './nominal';

/**
 * On-device inference for the models trained offline on the real UAV
 * telemetry corpora (training/train_vyom_ai.py -> aiModel.json):
 *  - failure-mode classifier (multiclass logistic regression, 96.4% val acc)
 *  - RUL regressor (ridge, MAE ~209 h)
 * Runs entirely in the browser - zero network, zero latency, zero deps.
 *
 * FEATURE SCHEME (v2, must match the trainer): every level feature is a
 * baseline-relative INDEX - log(value / healthy-nominal) - so live vectors
 * land on the training manifold regardless of engine scale or unit system.
 * The trainer baselines on each corpus's own healthy rows; here we baseline
 * on the app's NOMINAL envelope (src/lib/nominal.ts), which is the GAS418S
 * healthy cruise point (matches the real FLYGAS telemetry baseline closely).
 */

interface ModelShape {
  version: number;
  featureScheme: string;
  refDtSec: number;
  features: string[];
  scaler: { mean: number[]; std: number[] };
  classifier: {
    classes: string[];
    coef: number[][];
    intercept: number[];
    valAccuracy: number;
    valMacroF1: number;
  };
  regressor: { coef: number[]; intercept: number; valMAEh: number };
}

const model = rawModel as ModelShape;

const FEATURE_CLIP = 6.0;
/** Slope reference lag in seconds - trainer exports refDtSec; must match. */
const REF_DT_SEC = model.refDtSec ?? 10;

const PSI_PER_BAR = 14.5038;
const EPS = 1e-6;

const idx = (value: number, base: number): number =>
  Math.max(-FEATURE_CLIP, Math.min(FEATURE_CLIP, Math.log(Math.max(value, EPS) / Math.max(base, EPS))));

/** egt_c index (K -> degC before the ratio). */
const egtC = (tetK: number): number => tetK - 273.15;

/** The 8 level indices, in the trainer's LEVELS order. */
export function levelIndices(t: EngineTelemetry): number[] {
  return [
    idx(t.throttle, NOMINAL.throttle),
    idx(t.n2Rpm, NOMINAL.n2Rpm),
    idx(egtC(t.tet), egtC(NOMINAL.tet)),
    idx(t.oilPressure / PSI_PER_BAR, NOMINAL.oilPressure / PSI_PER_BAR),
    idx(t.fuelFlow, NOMINAL.fuelFlow),
    idx(t.vibration, NOMINAL.vibration),
    idx(t.batteryVoltage, NOMINAL.batteryVoltage),
    idx(t.altitude, NOMINAL.altitude),
  ];
}

export interface SlopePair {
  /** per-minute rate of the egt index */
  egtSlopeIdxPerMin: number;
  /** per-minute rate of the vibration index */
  vibeSlopeIdxPerMin: number;
}

/**
 * Slope features over a ~10 s window (the trainer's reference lag). Pass
 * telemetry frames plus the span between first and last in seconds; falls
 * back to a single-frame diff when the window is too short.
 */
export function slopeFeatures(window: EngineTelemetry[], dtSec: number): SlopePair {
  if (window.length < 2) return { egtSlopeIdxPerMin: 0, vibeSlopeIdxPerMin: 0 };
  const first = window[0];
  const last = window[window.length - 1];
  const cur = levelIndices(last);
  const ref = levelIndices(first);
  const egtIdx = 2; // LEVELS position of egt
  const vibeIdx = 5;
  // Normalize to the trainer's 10 s reference lag: a window SHORTER than
  // REF_DT_SEC must NOT be extrapolated to a full minute (a 0.5 s delta
  // x120/min amplifies noise 20x into a false failure signature). Longer
  // windows keep the true per-minute rate.
  const perMin = 60 / Math.max(dtSec, REF_DT_SEC);
  const clamp = (v: number) => Math.max(-FEATURE_CLIP, Math.min(FEATURE_CLIP, v));
  return {
    egtSlopeIdxPerMin: clamp((cur[egtIdx] - ref[egtIdx]) * perMin),
    vibeSlopeIdxPerMin: clamp((cur[vibeIdx] - ref[vibeIdx]) * perMin),
  };
}

function standardize(x: number[]): number[] {
  return x.map((v, i) => (v - model.scaler.mean[i]) / model.scaler.std[i]);
}

function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const exp = z.map((v) => Math.exp(v - m));
  const s = exp.reduce((a, b) => a + b, 0);
  return exp.map((v) => v / s);
}

export interface OnDevicePrediction {
  /** subsystem -> probability, sorted desc, including Normal */
  probabilities: { subsystem: string; p: number }[];
  /** predicted RUL in hours from the ridge regressor */
  rulHours: number;
  /** blended: model RUL drifted toward the twin's own physics estimate */
  rulHoursBlended: number;
  topSubsystem: string;
  topProbability: number;
}

/**
 * Blend factor: the regressor was trained mostly on simulated corpora whose
 * RUL spans (~450-1,750 h) differ from the twin's physics estimate, so the
 * UI shows a weighted mix (70% trained model / 30% twin estimate).
 */
const RUL_MODEL_WEIGHT = 0.7;

export function predict(
  frame: EngineTelemetry,
  prev: EngineTelemetry | null,
  dtSec: number,
  slopes?: SlopePair,
): OnDevicePrediction {
  const levels = levelIndices(frame);
  // explicit window slopes from the caller, else a prev-frame diff through
  // the same guarded slopeFeatures path (never extrapolates past the
  // trainer's 10 s reference factor)
  const pair = slopes ?? (prev ? slopeFeatures([prev, frame], dtSec) : { egtSlopeIdxPerMin: 0, vibeSlopeIdxPerMin: 0 });
  const x = standardize([...levels, pair.egtSlopeIdxPerMin, pair.vibeSlopeIdxPerMin]);

  // multiclass logistic regression
  const scores = model.classifier.classes.map((_, k) => {
    const w = model.classifier.coef[k];
    let z = model.classifier.intercept[k];
    for (let i = 0; i < w.length; i++) z += w[i] * x[i];
    return z;
  });
  const probs = softmax(scores);
  const probabilities = model.classifier.classes
    .map((subsystem, i) => ({ subsystem, p: probs[i] }))
    .sort((a, b) => b.p - a.p);

  // ridge regressor
  let rul = model.regressor.intercept;
  for (let i = 0; i < model.regressor.coef.length; i++) rul += model.regressor.coef[i] * x[i];

  return {
    probabilities,
    rulHours: Math.max(0, rul),
    rulHoursBlended: Math.max(0, RUL_MODEL_WEIGHT * rul + (1 - RUL_MODEL_WEIGHT) * frame.rulHours),
    topSubsystem: probabilities[0].subsystem,
    topProbability: probabilities[0].p,
  };
}

/** True when the trained model flags a non-Normal subsystem above the bar. */
export function isFailurePredicted(pred: OnDevicePrediction, bar = 0.35): boolean {
  return pred.topSubsystem !== 'Normal' && pred.topProbability >= bar;
}

export const modelMeta = {
  version: model.version,
  featureScheme: model.featureScheme,
  valAccuracy: model.classifier.valAccuracy,
  valMacroF1: model.classifier.valMacroF1,
  rulMAEh: model.regressor.valMAEh,
  classes: model.classifier.classes,  trainedOn: Object.entries((model as unknown as { trainedOn: Record<string, number> }).trainedOn).map(
    ([k, v]) => `${k}: ${v} rows`,
  ),
};
