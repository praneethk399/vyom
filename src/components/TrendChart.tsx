import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ACCENT } from '../lib/palette';

interface TrendChartProps {
  label: string;
  unit: string;
  series: { t: number; v: number }[];
  min: number;
  max: number;
  color?: string;
  height?: number;
  /** live current value shown in the header (severity-tinted via `color`) */
  current?: number;
  format?: (v: number) => string;
}

function TrendTooltip({ active, payload, unit }: { active?: boolean; payload?: Array<{ value: number }>; unit: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="surface px-2 py-1 text-[10px]">
      <span className="num text-accent">{payload[0].value}</span> <span className="text-muted">{unit}</span>
    </div>
  );
}

export function TrendChart({ label, unit, series, min, max, color = ACCENT, height = 56, current, format }: TrendChartProps) {
  return (
    <div className="min-w-0">
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <span className="eyebrow">{label}</span>
        <span className="num whitespace-nowrap text-[10px] font-bold leading-none" style={{ color }}>
          {current != null ? (format ? format(current) : current.toFixed(1)) : '—'}
          <span className="ml-1 text-[8px] font-normal text-muted">{unit}</span>
        </span>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 3, right: 3, bottom: 0, left: 3 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="t" hide />
            <YAxis domain={[min, max]} hide />
            <Tooltip content={<TrendTooltip unit={unit} />} />
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}