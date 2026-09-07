import type { ComponentRul, FaultClass } from '../../lib/types';

/** Fault -> affected components -> accelerated wear (wearPercentage points).
 * Component names reflect the turbo-supercharged core: compressor rotor,
 * HP blades, main shaft bearings, hot section. */
const FAULT_WEAR: Partial<Record<FaultClass, Record<string, number>>> = {
  TET_RUNWAY: { 'supercharger': 22, 'sc-impeller-blade': 9, 'crankshaft-bearing': 4, 'exhaust-valve': 12 },
  VIBRATION_GROWTH: { 'crankshaft-bearing': 26, 'supercharger': 12, 'gearbox': 9 },
  OIL_PRESSURE_LOSS: { 'crankshaft-bearing': 30, 'supercharger': 14 },
  COMPRESSOR_STALL: { 'sc-impeller-blade': 34, 'gearbox': 10, 'supercharger': 8 },
  FUEL_FLOW_ANOMALY: { 'fuel-injector': 28, 'combustor-liner': 12 },
  BATTERY_SAG: { 'starter-generator': 26, 'fuel-injector': 5 },
};

export const BASE_COMPONENTS: ComponentRul[] = [
  {
    id: 'exhaust-valve',
    name: 'Turbine Hot Section / Nozzle',
    rulHours: 340,
    nominalTboHours: 700,
    wearPercentage: 51,
    lifingModel: 'Creep-fatigue (Larson-Miller)',
    condition: 'MONITOR',
    recommendation: 'Trend TET against the 1,160 K soft limit; borescope the nozzle guide vanes at the next 100 h window.',
  },
  {
    id: 'crankshaft-bearing',
    name: 'Main Shaft Bearings',
    rulHours: 618,
    nominalTboHours: 900,
    wearPercentage: 31,
    lifingModel: 'ISO 281 fatigue',
    condition: 'GOOD',
    recommendation: 'Continue normal ops; trend oil pressure and vibration on every cycle.',
  },
  {
    id: 'supercharger',
    name: 'Compressor Rotor Assembly',
    rulHours: 412,
    nominalTboHours: 800,
    wearPercentage: 49,
    lifingModel: 'Creep-fatigue (Larson-Miller)',
    condition: 'MONITOR',
    recommendation: 'Monitor TET excursions and EPR trend; schedule compressor rotor inspection within 100 flight hours.',
  },
  {
    id: 'gearbox',
    name: 'Gearbox',
    rulHours: 292,
    nominalTboHours: 500,
    wearPercentage: 42,
    lifingModel: 'Tooth pitting (AGMA)',
    condition: 'GOOD',
    recommendation: 'Regular oil sampling; listen for gear whine during throttle transients.',
  },
  {
    id: 'fuel-injector',
    name: 'Fuel Injector Assembly',
    rulHours: 148,
    nominalTboHours: 250,
    wearPercentage: 41,
    lifingModel: 'Coking / flow degradation',
    condition: 'MONITOR',
    recommendation: 'Watch fuel-flow-to-throttle ratio; clean injector nozzles at next maintenance window.',
  },
  {
    id: 'sc-impeller-blade',
    name: 'HP Compressor Blades',
    rulHours: 96,
    nominalTboHours: 600,
    wearPercentage: 84,
    lifingModel: 'High-cycle fatigue (Goodman)',
    condition: 'ACTION_REQUIRED',
    recommendation: 'Borescope the compressor inlet; blade-tip erosion is trending toward the airworthiness limit.',
  },
  {
    id: 'starter-generator',
    name: 'Starter Generator',
    rulHours: 231,
    nominalTboHours: 400,
    wearPercentage: 42,
    lifingModel: 'Bearing + brush wear',
    condition: 'GOOD',
    recommendation: 'Verify DC bus regulation after battery-health events.',
  },
];

export const CONDITION_COLOR: Record<ComponentRul['condition'], string> = {
  EXCELLENT: 'var(--nominal)',
  GOOD: 'var(--nominal)',
  MONITOR: 'var(--monitor)',
  ACTION_REQUIRED: 'var(--action)',
};

/** Apply fault-driven accelerated wear so maintenance visibly ripples from the scenario */
export function componentsWithFaults(fault: FaultClass): ComponentRul[] {
  const wear = FAULT_WEAR[fault];
  if (!wear) return BASE_COMPONENTS;
  return BASE_COMPONENTS.map((c) => {
    const boost = wear[c.id] ?? 0;
    if (boost === 0) return c;
    const wearPercentage = Math.min(97, c.wearPercentage + boost);
    const rulHours = Math.max(4, Math.round(c.nominalTboHours * (1 - wearPercentage / 100)));
    const condition = wearPercentage >= 80 ? 'ACTION_REQUIRED' : wearPercentage >= 55 ? 'MONITOR' : c.condition;
    return { ...c, wearPercentage, rulHours, condition };
  });
}