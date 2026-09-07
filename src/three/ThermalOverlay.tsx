import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clamp01 } from '../lib/nominal';
import { gradientColor, THERMAL_STOPS, type ColorStop } from '../lib/palette';
import { forEachPart, useEngineMeshState } from './useEngineMesh';
import type { InstancedStage } from './useEngineMesh';

// Pre-baked gradient LUT — 64 entries built once at module load, so the
// per-frame loop does zero string parsing and zero allocations.
const LUT_SIZE = 64;
function buildLut(stops: ColorStop[]): THREE.Color[] {
  const lut: THREE.Color[] = new Array(LUT_SIZE);
  for (let i = 0; i < LUT_SIZE; i++) {
    lut[i] = new THREE.Color(gradientColor(stops, i / (LUT_SIZE - 1)));
  }
  return lut;
}
const THERMAL_LUT = buildLut(THERMAL_STOPS);

const scratch = new THREE.Color();

/**
 * Colors the registered engine parts by the thermal gradient driven by tet,
 * weighted by each part's heat response. Instanced blade stages get per-blade
 * colors written straight into instanceColor — one buffer upload per stage,
 * shaded in parallel on the GPU. Runs in useFrame — no React re-renders.
 */
export function ThermalOverlay() {
  const { frameRef, activeRef } = useEngineMeshState();

  useFrame((state) => {
    const frame = frameRef.current;
    const t = state.clock.elapsedTime;
    const active = activeRef.current;

    // base drive from the live EGT (calibrated: cruise EGT ~1040-1120 K)
    const drive = frame ? 0.55 + (frame.tet - 1040) / 500 : 0.18;

    forEachPart((part) => {
      if ('mesh' in part) {
        const stage = part as InstancedStage;
        const ca = stage.mesh.instanceColor?.array as Float32Array | undefined;
        if (!ca) return;
        let u0 = 0;
        for (let i = 0; i < stage.count; i++) {
          const u = clamp01(drive * (stage.heatBase + stage.variance[i]));
          if (i === 0) u0 = u;
          const c = THERMAL_LUT[(u * (LUT_SIZE - 1)) | 0];
          const o = i * 3;
          ca[o] = c.r;
          ca[o + 1] = c.g;
          ca[o + 2] = c.b;
        }
        if (stage.mesh.instanceColor) stage.mesh.instanceColor.needsUpdate = true;
        const mat = stage.mesh.material as THREE.MeshStandardMaterial;
        const c0 = THERMAL_LUT[(u0 * (LUT_SIZE - 1)) | 0];
        mat.emissive.copy(c0).multiplyScalar(stage.subsystem === active ? 0.75 + 0.45 * Math.sin(t * 6) : 0.22 + 0.3 * u0);
        return;
      }

      const mat = part.materials[0];
      if (!mat) return;
      const u = clamp01(drive * part.heat);
      scratch.copy(THERMAL_LUT[(u * (LUT_SIZE - 1)) | 0]);
      mat.color.copy(scratch);
      const isActive = part.subsystem != null && part.subsystem === active;
      mat.emissive.copy(scratch).multiplyScalar(isActive ? 0.75 + 0.45 * Math.sin(t * 6) : 0.22 + 0.3 * u);
    });
  });

  return null;
}
