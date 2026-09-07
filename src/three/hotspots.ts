import type { Subsystem } from '../lib/types';

export interface HotspotDef {
  subsystem: Subsystem;
  position: [number, number, number];
}

/** Marker positions on the turbo-supercharged core twin (see EngineModel layout) */
export const HOTSPOTS: HotspotDef[] = [
  { subsystem: 'Compressor', position: [0, 0.9, -1.35] }, // 3-stage compressor case
  { subsystem: 'Combustor', position: [0, 0.85, 0.1] }, // annular combustor can
  { subsystem: 'Turbine', position: [0, 0.95, 1.35] }, // turbine stages + nozzle
  { subsystem: 'Bearings & Shaft', position: [0, -1.15, -0.6] }, // accessory gearbox / shaft line
  { subsystem: 'Electrical', position: [0, -1.15, -1.6] }, // starter-generator
  { subsystem: 'Fuel System', position: [0.95, 0.75, 0.05] }, // fuel manifold ring
];
