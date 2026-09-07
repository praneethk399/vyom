import { clamp01 } from '../lib/nominal';
import { SEVERITY_COLOR } from '../lib/palette';
import type { Severity } from '../lib/types';
import { CountUp } from './CountUp';

interface GaugeDialProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  format?: (v: number) => string;
  severity?: Severity;
  size?: number;
}

function polar(cx: number, cy: number, r: number, t: number): [number, number] {
  const a = Math.PI * (1 - t);
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
}

function arcPath(cx: number, cy: number, r: number, t: number): string {
  const [x0, y0] = polar(cx, cy, r, 0);
  const [x1, y1] = polar(cx, cy, r, t);
  const large = t > 0.5 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function GaugeDial({
  label,
  value,
  min,
  max,
  unit,
  format = (v: number) => v.toFixed(0),
  severity = 'nominal',
  size = 118,
}: GaugeDialProps) {
  const t = clamp01((value - min) / (max - min));
  const color = SEVERITY_COLOR[severity];
  const cx = size / 2;
  const cy = size / 2 + 4;
  const r = size * 0.34;
  const ticks = Array.from({ length: 11 }, (_, i) => i / 10);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`} role="img" aria-label={`${label} ${value} ${unit}`}>
        <path d={arcPath(cx, cy, r, 1)} fill="none" stroke="var(--line)" strokeWidth={4} />
        {ticks.map((tk) => {
          const [x0, y0] = polar(cx, cy, r + 4, tk);
          const [x1, y1] = polar(cx, cy, r + 8, tk);
          return <line key={tk} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--line-strong)" strokeWidth={1} />;
        })}
        {/* full-length path, dash-eased to the value so the arc animates */}
        <path
          d={arcPath(cx, cy, r, 1)}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="butt"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - t}
          className="arc-fill"
        />
      </svg>
      <div className="-mt-1 flex flex-col items-center gap-1">
        <span className="cas-readout">
          <CountUp value={value} format={format} className="glow-accent text-lg font-bold leading-none" style={{ color }} />
          <span className="text-[9px] text-muted">{unit}</span>
        </span>
        <span className="eyebrow !text-[8px]" style={{ color: severity === 'nominal' ? undefined : color }}>
          {label}
        </span>
      </div>
    </div>
  );
}