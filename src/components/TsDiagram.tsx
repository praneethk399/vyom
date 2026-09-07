import { useMemo } from 'react';
import { buildTsLoops, cycleDeviations, type TsLoopPoint } from '../lib/thermo';
import { SEVERITY_COLOR } from '../lib/palette';
import { classifyValue, RULE_BY_PARAM } from '../lib/thresholds';
import type { EntropyPoints, Severity } from '../lib/types';

interface TsDiagramProps {
  entropyPoints: EntropyPoints;
  tet: number;
  pressureRatio: number;
  severity?: Severity;
  className?: string;
}

const W = 620;
const H = 320;
const PAD = { l: 48, r: 16, t: 16, b: 36 };

export function TsDiagram({ entropyPoints, tet, pressureRatio, severity, className = '' }: TsDiagramProps) {
  const { real, ideal } = useMemo(
    () => buildTsLoops(entropyPoints, tet, pressureRatio),
    [entropyPoints, tet, pressureRatio],
  );
  const dev = useMemo(() => cycleDeviations(entropyPoints), [entropyPoints]);

  const allS = [...real.map((p) => p.s), ...ideal.map((p) => p.s)];
  const allT = [...real.map((p) => p.t), ...ideal.map((p) => p.t)];
  const sMin = Math.min(...allS) - 0.06;
  const sMax = Math.max(...allS) + 0.06;
  const tMin = Math.min(...allT) - 50;
  const tMax = Math.max(...allT) + 60;
  const x = (s: number) => PAD.l + ((s - sMin) / (sMax - sMin)) * (W - PAD.l - PAD.r);
  const y = (t: number) => H - PAD.b - ((t - tMin) / (tMax - tMin)) * (H - PAD.t - PAD.b);

  const loopPath = (pts: TsLoopPoint[]) => {
    const closed = [...pts, pts[0]];
    return closed.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.s).toFixed(1)} ${y(p.t).toFixed(1)}`).join(' ');
  };

  const sev = severity ?? classifyValue(RULE_BY_PARAM.get('tet')!, tet);
  const realColor = SEVERITY_COLOR[sev];

  // deviation band: real loop polygon (fill) shows the gap vs ideal
  const gridT = Array.from({ length: 5 }, (_, i) => tMin + ((tMax - tMin) * (i + 1)) / 6);
  const gridS = Array.from({ length: 6 }, (_, i) => sMin + ((sMax - sMin) * (i + 1)) / 7);

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="T-s Brayton cycle diagram">
        {gridT.map((g) => (
          <line key={`t${g}`} x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth={0.5} />
        ))}
        {gridS.map((g) => (
          <line key={`s${g}`} x1={x(g)} x2={x(g)} y1={PAD.t} y2={H - PAD.b} stroke="var(--line)" strokeWidth={0.5} />
        ))}

        {/* ideal reference loop */}
        <path d={loopPath(ideal)} fill="none" stroke="var(--line-strong)" strokeWidth={1} strokeDasharray="4 4" opacity={0.55} />

        {/* real loop */}
        <path d={loopPath(real)} fill={realColor} fillOpacity={0.06} stroke={realColor} strokeWidth={1.6} />

        {/* state points */}
        {real.map((p, i) => (
          <g key={i}>
            <circle cx={x(p.s)} cy={y(p.t)} r={3.2} fill={realColor} stroke="var(--bg)" strokeWidth={1} />
            <text x={x(p.s) + 6} y={y(p.t) - 5} fontSize={10} fontFamily="IBM Plex Mono, monospace" fill="var(--muted)">
              s{i + 1}
            </text>
          </g>
        ))}

        {/* axis labels */}
        <text x={PAD.l} y={H - 10} fontSize={9} fontFamily="IBM Plex Mono, monospace" fill="var(--muted)">
          s — SPECIFIC ENTROPY (kJ/kg·K)
        </text>
        <text
          x={12}
          y={PAD.t + 10}
          fontSize={9}
          fontFamily="IBM Plex Mono, monospace"
          fill="var(--muted)"
          transform={`rotate(-90 12 ${PAD.t + 10})`}
        >
          T — TEMPERATURE (K)
        </text>
      </svg>
      <div className="bd-t mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 pt-1.5">
        <span className="flex items-center gap-1.5 text-[9px] text-muted">
          <span className="inline-block h-0.5 w-4" style={{ background: realColor }} /> REAL CYCLE
        </span>
        <span className="flex items-center gap-1.5 text-[9px] text-muted">
          <span className="inline-block h-0.5 w-4 border-t border-dashed" style={{ borderColor: 'var(--line-strong)' }} /> IDEAL REFERENCE
        </span>
        <span className="num text-[9px] text-muted">ΔS COMP {dev.compRise.toFixed(3)}</span>
        <span className="num text-[9px] text-muted">ΔS TURB {dev.turbRise.toFixed(3)}</span>
      </div>
    </div>
  );
}