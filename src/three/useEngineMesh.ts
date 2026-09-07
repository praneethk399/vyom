import { useEffect, useRef } from 'react';
import type { InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { useTelemetryStore } from '../state/telemetryStore';
import { useUiStore } from '../state/uiStore';
import type { EngineTelemetry, OverlayMode, Subsystem } from '../lib/types';

export interface EnginePart {
  group: Object3D;
  materials: MeshStandardMaterial[];
  /** heat response weight (0..1) for the thermal overlay */
  heat: number;
  /** stress response weight (0..1) for the stress overlay */
  stress: number;
  subsystem?: Subsystem;
}

/** An instanced blade stage: one InstancedMesh, per-blade colors in instanceColor */
export interface InstancedStage {
  mesh: InstancedMesh;
  count: number;
  heatBase: number;
  stressBase: number;
  /** per-blade heat variance (length = count) so the map reads organically */
  variance: Float32Array;
  subsystem: Subsystem;
}

// globalThis singleton: survives HMR module duplication so EngineModel and the
// overlays always share one registry even if Vite re-executes this module.
const g = globalThis as { __vyomEngineRegistry?: Map<string, EnginePart | InstancedStage> };
const registry = g.__vyomEngineRegistry ?? (g.__vyomEngineRegistry = new Map<string, EnginePart | InstancedStage>());

export function registerPart(key: string, part: EnginePart): void {
  registry.set(key, part);
}

export function registerInstancedStage(key: string, stage: InstancedStage): void {
  registry.set(key, stage);
}

export function unregisterPart(key: string): void {
  registry.delete(key);
}

export function allParts(): (EnginePart | InstancedStage)[] {
  return [...registry.values()];
}

/** Allocation-free iteration for the per-frame overlay loops */
export function forEachPart(fn: (part: EnginePart | InstancedStage) => void): void {
  const it = registry.values();
  let r = it.next();
  while (!r.done) {
    fn(r.value);
    r = it.next();
  }
}

/** Latest frame + UI state, kept in refs for the useFrame loops */
export function useEngineMeshState() {
  const frameRef = useRef<EngineTelemetry | null>(null);
  const overlayRef = useRef<OverlayMode>('thermal');
  const activeRef = useRef<Subsystem | null>(null);

  useEffect(() => useTelemetryStore.subscribe((s) => (frameRef.current = s.frame)), []);
  useEffect(
    () =>
      useUiStore.subscribe((s) => {
        overlayRef.current = s.overlay;
        activeRef.current = s.activeSubsystem;
      }),
    [],
  );

  return { frameRef, overlayRef, activeRef };
}
