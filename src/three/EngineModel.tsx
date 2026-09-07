import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useUiStore } from '../state/uiStore';
import { useTelemetryStore } from '../state/telemetryStore';
import { ACCENT, SEVERITY_COLOR } from '../lib/palette';
import { classifyValue, RULE_BY_PARAM } from '../lib/thresholds';
import { HOTSPOTS } from './hotspots';
import { registerPart, unregisterPart } from './useEngineMesh';
import { InstancedBladeDisk, type InstancedStageDef } from './InstancedBladeDisk';
import { ThermalOverlay } from './ThermalOverlay';
import { StressOverlay } from './StressOverlay';
import type { Subsystem } from '../lib/types';

// ---------------------------------------------------------------------------
// GAS418S technical twin — the turbo-supercharged core the sample dataset
// describes: intake spinner -> 3-stage compressor (GPU-instanced blades) ->
// annular combustor can -> 2-stage turbine (instanced) -> exhaust nozzle.
// Nacelle cage, shaft, bearings, gearbox, fuel manifold, accessory gearbox.
// Schema subsystems: Turbine -> turbine stages/nozzle, Compressor ->
// compressor stages, Combustor -> combustor can, Bearings & Shaft -> shaft
// line, Electrical -> accessory units, Fuel System -> manifold/nozzles.
// ---------------------------------------------------------------------------

// compressor stages: cool, rising pressure
const COMPRESSOR_STAGES: InstancedStageDef[] = [
  { z: -1.7, hub: 0.52, bladeLen: 0.5, count: 24, heat: 0.12, stress: 0.45, subsystem: 'Compressor' },
  { z: -1.25, hub: 0.56, bladeLen: 0.42, count: 28, heat: 0.2, stress: 0.58, subsystem: 'Compressor' },
  { z: -0.85, hub: 0.6, bladeLen: 0.36, count: 32, heat: 0.28, stress: 0.68, subsystem: 'Compressor' },
];

// turbine stages: hot, right behind the combustor
const TURBINE_STAGES: InstancedStageDef[] = [
  { z: 0.85, hub: 0.58, bladeLen: 0.42, count: 30, heat: 0.88, stress: 0.95, subsystem: 'Turbine' },
  { z: 1.3, hub: 0.55, bladeLen: 0.48, count: 26, heat: 0.72, stress: 0.82, subsystem: 'Turbine' },
];

const METAL = '#5f7183';
const METAL_DARK = '#3d4a56';
const ALLOY = '#7c8b96';

function EngineGeometry() {
  const spoolGroup = useRef<THREE.Group>(null);
  const casingRef = useRef<THREE.Group>(null);
  const renderMode = useUiStore((s) => s.renderMode);

  // static parts — registered once with the overlay registry. keepMat=true
  // honors the JSX-declared material (translucent shells) instead of
  // replacing it with an opaque standard material.
  const staticRef = useCallback(
    (key: string, heat: number, stress: number, subsystem?: Subsystem, base = METAL, keepMat = false) =>
      (mesh: THREE.Mesh | null) => {
        if (mesh) {
          if (!mesh.userData.__vyomRegistered) {
            if (!keepMat) {
              const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.55, metalness: 0.25 });
              mesh.material = mat;
            }
            mesh.userData.__vyomRegistered = true;
          }
          registerPart(key, {
            group: mesh,
            materials: mesh.material instanceof THREE.MeshStandardMaterial ? [mesh.material] : [],
            heat,
            stress,
            subsystem,
          });
        } else {
          unregisterPart(key);
        }
      },
    [],
  );

  useEffect(() => {
    // toggle wireframe on every shaded material in the casing group
    casingRef.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m instanceof THREE.MeshStandardMaterial) m.wireframe = renderMode === 'wireframe';
    });
  }, [renderMode]);

  useFrame((_, dt) => {
    if (spoolGroup.current) spoolGroup.current.rotation.z -= dt * 3.2; // gas-generator spool
  });

  return (
    <group ref={casingRef}>
      {/* nacelle / casing — translucent cutaway shell, NOT overlay-recruited:
          it must stay glass so the spools stay visible in shaded mode */}
      <mesh>
        <cylinderGeometry args={[1.35, 1.35, 4.6, 48, 1, true]} />
        <meshStandardMaterial
          color="#2b3a45"
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
          roughness={0.7}
          metalness={0.1}
        />
      </mesh>

      {/* intake spinner + bullet — protrudes ahead of the intake lip */}
      <group position={[0, 0, -2.75]}>
        <mesh ref={staticRef('spinner', 0.1, 0.35, 'Compressor', ALLOY)} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.5, 0.9, 28]} />
        </mesh>
      </group>

      {/* compressor case — translucent so the bladed stages read in shaded mode */}
      <mesh ref={staticRef('comp-case', 0.22, 0.5, 'Compressor', '#4c5c6a', true)} position={[0, 0, -1.3]}>
        <cylinderGeometry args={[1.06, 0.86, 2.5, 36]} />
        <meshStandardMaterial
          color="#4c5c6a"
          transparent
          opacity={0.28}
          depthWrite={false}
          roughness={0.6}
          metalness={0.2}
        />
      </mesh>
      <group ref={spoolGroup}>
        {COMPRESSOR_STAGES.map((stage, i) => (
          <InstancedBladeDisk key={`c${i}`} stage={stage} prefix={`comp${i}`} />
        ))}
        {/* compressor disk hubs */}
        {COMPRESSOR_STAGES.map((stage, i) => (
          <mesh
            key={`ch${i}`}
            ref={staticRef(`comp-hub-${i}`, stage.heat, stage.stress, 'Compressor', METAL)}
            position={[0, 0, stage.z]}
          >
            <cylinderGeometry args={[stage.hub, stage.hub, 0.16, 24]} />
          </mesh>
        ))}

      {/* diffuser duct — translucent so the spool reads through it */}
      <mesh ref={staticRef('diffuser', 0.4, 0.55, 'Compressor', '#56697a', true)} position={[0, 0, -0.45]}>
        <cylinderGeometry args={[0.68, 0.78, 0.5, 28]} />
        <meshStandardMaterial
          color="#56697a"
          transparent
          opacity={0.3}
          depthWrite={false}
          roughness={0.6}
          metalness={0.2}
        />
      </mesh>

        {/* turbine disk hubs */}
        {TURBINE_STAGES.map((stage, i) => (
          <mesh
            key={`th${i}`}
            ref={staticRef(`turb-hub-${i}`, stage.heat, stage.stress, 'Turbine', '#6e5f52')}
            position={[0, 0, stage.z]}
          >
            <cylinderGeometry args={[stage.hub, stage.hub, 0.16, 24]} />
          </mesh>
        ))}
        {TURBINE_STAGES.map((stage, i) => (
          <InstancedBladeDisk key={`t${i}`} stage={stage} prefix={`turb${i}`} />
        ))}

        {/* shaft line */}
        <mesh ref={staticRef('shaft', 0.35, 0.9, 'Bearings & Shaft', METAL_DARK)}>
          <cylinderGeometry args={[0.13, 0.13, 3.4, 16]} />
        </mesh>
      </group>

      {/* annular combustor — translucent can over a glowing liner */}
      <group position={[0, 0, 0.05]}>
        <mesh ref={staticRef('combustor', 1, 0.75, 'Combustor', '#6e5f52', true)}>
          <cylinderGeometry args={[0.72, 0.72, 0.8, 32, 1, true]} />
          <meshStandardMaterial
            color="#6e5f52"
            transparent
            opacity={0.32}
            side={THREE.DoubleSide}
            depthWrite={false}
            roughness={0.6}
            metalness={0.2}
          />
        </mesh>
        <mesh ref={staticRef('combustor-liner', 1, 0.8, 'Combustor', '#7a5c3f')} position={[0, 0, 0.05]}>
          <sphereGeometry args={[0.52, 20, 14]} />
        </mesh>
        <pointLight position={[0, 0, 0]} intensity={2.4} distance={3.2} color="#ff9a3c" />
      </group>

      {/* nozzle — translucent so the turbine stages stay visible */}
      <mesh ref={staticRef('nozzle', 0.62, 0.7, 'Turbine', '#56697a', true)} position={[0, 0, 2.15]}>
        <cylinderGeometry args={[0.9, 0.62, 0.7, 32, 1, true]} />
        <meshStandardMaterial
          color="#56697a"
          transparent
          opacity={0.24}
          depthWrite={false}
          roughness={0.6}
          metalness={0.2}
        />
      </mesh>
      <mesh ref={staticRef('tailcone', 0.7, 0.6, 'Turbine', METAL_DARK)} position={[0, 0, 2.55]}>
        <coneGeometry args={[0.34, 0.75, 20]} />
      </mesh>

      {/* accessory gearbox + units under the core */}
      <mesh ref={staticRef('agb', 0.3, 0.6, 'Bearings & Shaft', '#4c5c6a')} position={[0, -1.0, -0.6]}>
        <boxGeometry args={[0.7, 0.35, 1.3]} />
      </mesh>
      {/* starter-generator */}
      <mesh ref={staticRef('starter-gen', 0.25, 0.5, 'Electrical', ALLOY)} position={[0, -1.0, -1.55]}>
        <cylinderGeometry args={[0.2, 0.2, 0.5, 16]} />
      </mesh>
      {/* oil tank */}
      <mesh ref={staticRef('oil-tank', 0.25, 0.35, 'Bearings & Shaft', METAL_DARK)} position={[0.95, -0.85, -1.6]}>
        <cylinderGeometry args={[0.26, 0.26, 0.5, 16]} />
      </mesh>

      {/* fuel manifold ring + nozzles into the combustor */}
      <mesh ref={staticRef('fuel-manifold', 0.3, 0.35, 'Fuel System', '#6b7c68')} position={[0, 0.02, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.02, 0.045, 10, 40]} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <mesh
            key={i}
            ref={staticRef(`nozzle-${i}`, 0.5, 0.35, 'Fuel System', ALLOY)}
            position={[Math.cos(a) * 0.92, Math.sin(a) * 0.92, -0.35]}
          >
            <cylinderGeometry args={[0.04, 0.04, 0.34, 8]} />
          </mesh>
        );
      })}

      {/* main bearings along the shaft line */}
      {[-1.6, -0.5, 0.9, 1.7].map((z, i) => (
        <mesh
          key={i}
          ref={staticRef(`bearing-${i}`, 0.45, 0.95, 'Bearings & Shaft', ALLOY)}
          position={[0, 0, z]}
        >
          <torusGeometry args={[0.22, 0.07, 10, 22]} />
        </mesh>
      ))}

      {/* reference grid floor */}
      <gridHelper args={[16, 32, '#155e75', '#0e2a35']} position={[0, -2.2, 0]} />

      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, -4]} intensity={1.2} />
      <directionalLight position={[-4, 2, 4]} intensity={0.55} />
      <pointLight position={[-5, 2, -3]} intensity={0.5} color={ACCENT} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Exhaust jet — additive core plume at the nozzle, severity-tinted by TET.
// ---------------------------------------------------------------------------
function Plume() {
  const frame = useTelemetryStore((s) => s.frame);
  const groupRef = useRef<THREE.Group>(null);
  const outerMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  const tetSeverity = frame ? classifyValue(RULE_BY_PARAM.get('tet')!, frame.tet) : 'nominal';
  const flame = SEVERITY_COLOR[tetSeverity];

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (groupRef.current) {
      const pulse = 1 + 0.08 * Math.sin(t * 9);
      groupRef.current.scale.set(pulse, pulse, 1 + 0.12 * Math.sin(t * 7));
    }
    outerMats.current.forEach((mat) => {
      if (mat) mat.opacity = (0.045 + 0.02 * Math.sin(t * 5)) * (frame ? 1 : 0.4);
    });
  });

  return (
    <group ref={groupRef} position={[0, 0, 3.05]}>
      {/* inner core — low opacity: additive cones saturate fast */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.55]}>
        <coneGeometry args={[0.14, 1.2, 18, 1, true]} />
        <meshBasicMaterial
          color={flame}
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* outer faint sheath */}
      {[0, 1].map((i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.7 + i * 0.15]} scale={1.6 + i * 0.7}>
          <coneGeometry args={[0.16, 1.5, 18, 1, true]} />
          <meshBasicMaterial
            ref={(m) => {
              outerMats.current[i] = m;
            }}
            color={flame}
            transparent
            opacity={0.12}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function Hotspots() {
  const active = useUiStore((s) => s.activeSubsystem);
  const setActive = useUiStore((s) => s.setActiveSubsystem);
  const [hovered, setHovered] = useState<Subsystem | null>(null);
  const markerRefs = useRef(new Map<string, THREE.Mesh>());

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (const h of HOTSPOTS) {
      const marker = markerRefs.current.get(h.subsystem);
      if (!marker) continue;
      const activePulse = h.subsystem === active || h.subsystem === hovered;
      const s = activePulse ? 1.5 + 0.3 * Math.sin(t * 5) : 1;
      marker.scale.setScalar(s);
    }
  });

  return (
    <group>
      {HOTSPOTS.map((h) => (
        <group key={h.subsystem} position={h.position}>
          <mesh
            onClick={(e) => {
              e.stopPropagation();
              setActive(h.subsystem === active ? null : h.subsystem);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(h.subsystem);
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              setHovered(null);
              document.body.style.cursor = 'auto';
            }}
          >
            <sphereGeometry args={[0.42, 12, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          <mesh
            ref={(m) => {
              if (m) markerRefs.current.set(h.subsystem, m);
              else markerRefs.current.delete(h.subsystem);
            }}
          >
            <octahedronGeometry args={[0.1, 0]} />
            <meshBasicMaterial color={h.subsystem === active ? '#f59e0b' : ACCENT} />
          </mesh>
          {(hovered === h.subsystem || active === h.subsystem) && (
            <Html center distanceFactor={8} position={[0, 0.45, 0]} style={{ pointerEvents: 'none' }}>
              <div
                className="whitespace-nowrap border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em]"
                style={{ background: 'var(--bg)', color: 'var(--accent)', borderColor: 'var(--line-strong)' }}
              >
                {h.subsystem}
              </div>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}

function EngineScene() {
  const overlay = useUiStore((s) => s.overlay);
  const plume = useUiStore((s) => s.plume);
  const controlsRef = useRef<{ autoRotate: boolean } | null>(null);
  const resumeTimer = useRef<number | null>(null);

  const pauseAutoRotate = () => {
    if (controlsRef.current) controlsRef.current.autoRotate = false;
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
  };
  const scheduleResume = () => {
    resumeTimer.current = window.setTimeout(() => {
      if (controlsRef.current) controlsRef.current.autoRotate = true;
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    };
  }, []);

  return (
    <>
      <Float speed={1.4} rotationIntensity={0.12} floatIntensity={0.25}>
        <EngineGeometry />
        {plume && <Plume />}
        <Hotspots />
      </Float>
      {overlay === 'thermal' ? <ThermalOverlay /> : <StressOverlay />}
      <OrbitControls
        ref={controlsRef as never}
        autoRotate
        autoRotateSpeed={0.7}
        enablePan={false}
        minDistance={3.6}
        maxDistance={12}
        onStart={pauseAutoRotate}
        onEnd={scheduleResume}
      />
    </>
  );
}

export function EngineView() {
  const plume = useUiStore((s) => s.plume);
  const togglePlume = useUiStore((s) => s.togglePlume);
  const renderMode = useUiStore((s) => s.renderMode);
  const setRenderMode = useUiStore((s) => s.setRenderMode);
  const overlay = useUiStore((s) => s.overlay);
  const frame = useTelemetryStore((s) => s.frame);

  const mapLabel =
    overlay === 'thermal'
      ? `THERMAL MAP (${frame ? frame.tet.toFixed(1) : '—'}K)`
      : `STRESS MAP (${frame ? frame.bladeStress.toFixed(0) : '—'} MPa)`;

  return (
    <div className="relative h-full w-full">
      {/* targeting reticle behind the scene */}
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
        <div className="hud-reticle" />
      </div>
      <Canvas dpr={[1, 1.75]} camera={{ position: [5.8, 2.9, -5.9], fov: 42 }} gl={{ antialias: true, alpha: true }}>
        <EngineScene />
      </Canvas>

      {/* top-left identity chips */}
      <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
        <span
          className="border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-accent"
          style={{ background: 'var(--bg-deep)', borderColor: 'var(--accent)' }}
        >
          ◈ GAS418S Turbo-Supercharged Core · 3D CAD Twin
        </span>
        <span
          className="border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-caution"
          style={{ background: 'var(--bg-deep)', borderColor: 'var(--caution)' }}
        >
          {mapLabel}
        </span>
      </div>

      {/* top-right render-mode toggle */}
      <div className="absolute right-2 top-2 flex" role="group" aria-label="Render mode">
        {(['shaded', 'wireframe'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setRenderMode(m)}
            aria-pressed={renderMode === m}
            className={`border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] transition-colors ${
              m === 'shaded' ? 'rounded-l' : 'rounded-r border-l-0'
            }`}
            style={{
              background: renderMode === m ? 'var(--accent-soft)' : 'var(--bg-deep)',
              color: renderMode === m ? 'var(--accent)' : 'var(--muted)',
              borderColor: renderMode === m ? 'var(--accent)' : 'var(--line)',
            }}
          >
            {m === 'shaded' ? '◆ Shaded' : '◇ Wireframe'}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={togglePlume}
        aria-pressed={plume}
        className="absolute bottom-2 right-2 border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] transition-colors"
        style={{
          background: 'var(--bg-deep)',
          color: plume ? 'var(--accent)' : 'var(--muted)',
          borderColor: plume ? 'var(--line-strong)' : 'var(--line)',
        }}
        title="Toggle exhaust jet"
      >
        {plume ? '● EXHAUST ON' : '○ EXHAUST OFF'}
      </button>
    </div>
  );
}
