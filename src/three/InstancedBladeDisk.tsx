import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { registerInstancedStage, unregisterPart } from './useEngineMesh';
import type { Subsystem } from '../lib/types';

// ---------------------------------------------------------------------------
// InstancedBladeDisk — one InstancedMesh per compressor/turbine stage. A whole
// stage renders in a single draw call instead of one mesh per blade, and the
// overlay updates all blade colors in parallel on the GPU via instanceColor.
// ---------------------------------------------------------------------------

export interface InstancedStageDef {
  z: number;
  hub: number;
  bladeLen: number;
  count: number;
  heat: number;
  stress: number;
  subsystem: Subsystem;
}

const BLADE_PROFILE = [0.055, 0.095, 0.105, 0.095, 0.055]; // airfoil-ish cross-section (x, thickness)
const PROFILE_HALF = BLADE_PROFILE.length / 2 - 0.5;

function bladeGeometry(bladeLen: number): THREE.BufferGeometry {
  // extruded 2D blade profile along Y (blade length), rounded tip
  const shape = new THREE.Shape();
  const pts: [number, number][] = [];
  for (let i = 0; i < BLADE_PROFILE.length; i++) {
    pts.push([BLADE_PROFILE[i], (i / PROFILE_HALF - 1) * 0.5]);
  }
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.lineTo(0.0, 0.5);
  shape.lineTo(-BLADE_PROFILE[0] * 0.6, 0.3);
  shape.lineTo(-BLADE_PROFILE[0] * 0.6, -0.3);
  shape.lineTo(0.0, -0.5);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
  geo.translate(0, 0, -0.08);
  // normalize height to bladeLen
  geo.scale(1, bladeLen, 1);
  return geo;
}

const bladeGeoCache = new Map<number, THREE.BufferGeometry>();
function bladeGeometryCached(bladeLen: number): THREE.BufferGeometry {
  let g = bladeGeoCache.get(bladeLen);
  if (!g) {
    g = bladeGeometry(bladeLen);
    bladeGeoCache.set(bladeLen, g);
  }
  return g;
}

export function InstancedBladeDisk({ stage, prefix }: { stage: InstancedStageDef; prefix: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const key = `${prefix}:stage:${stage.z}`;

    // per-blade heat variance so the thermal map reads organically
    const variance = new Float32Array(stage.count);
    for (let i = 0; i < stage.count; i++) variance[i] = ((i % 3) - 1) * 0.035;

    // position + orient every blade instance once
    const m = new THREE.Matrix4();
    const rot = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const euler = new THREE.Euler();
    for (let i = 0; i < stage.count; i++) {
      const a = (i / stage.count) * Math.PI * 2;
      pos.set(Math.cos(a) * (stage.hub + stage.bladeLen / 2), Math.sin(a) * (stage.hub + stage.bladeLen / 2), stage.z);
      euler.set(0, 0.35, a);
      rot.setFromEuler(euler);
      m.compose(pos, rot, scale);
      mesh.setMatrixAt(i, m);
      // seed instanceColor with the base heat; the overlay rewrites it per frame
      const heat = stage.heat + variance[i];
      mesh.setColorAt(i, new THREE.Color(heat, heat, heat));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    registerInstancedStage(key, {
      mesh,
      count: stage.count,
      heatBase: stage.heat,
      stressBase: stage.stress,
      variance,
      subsystem: stage.subsystem,
    });

    return () => {
      unregisterPart(key);
    };
  }, [stage, prefix]);

  return (
    <group>
      {/* disk hub */}
      <mesh position={[0, 0, stage.z]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[stage.hub, stage.hub, 0.12, 32]} />
        <meshStandardMaterial color="#3d4a56" roughness={0.5} metalness={0.35} />
      </mesh>
      <instancedMesh ref={meshRef} args={[undefined, undefined, stage.count]} frustumCulled={false}>
        <primitive object={bladeGeometryCached(stage.bladeLen)} attach="geometry" />
        <meshStandardMaterial roughness={0.55} metalness={0.25} />
      </instancedMesh>
    </group>
  );
}
