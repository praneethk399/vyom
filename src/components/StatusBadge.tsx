import { SEVERITY_COLOR, SEVERITY_LABEL } from '../lib/palette';
import type { Severity } from '../lib/types';

interface StatusBadgeProps {
  severity: Severity;
  label?: string;
  pulse?: boolean;
  className?: string;
}

export function StatusBadge({ severity, label, pulse = false, className = '' }: StatusBadgeProps) {
  const color = SEVERITY_COLOR[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] ${className}`}
      style={{ color, borderColor: `${color}66`, background: `${color}14` }}
    >
      <span
        className={`cas-glyph cas-glyph-${severity} ${pulse ? 'blink' : ''}`}
        style={{ color }}
        aria-hidden="true"
      />
      {label ?? SEVERITY_LABEL[severity]}
    </span>
  );
}