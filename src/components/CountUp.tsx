import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

interface CountUpProps {
  value: number;
  format?: (v: number) => string;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}

/** Eased count-up for numeric readouts; jumps instantly under reduced motion */
export function CountUp({ value, format = (v: number) => v.toFixed(0), duration = 600, className, style }: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = to;
    if (reduced || from === to) {
      setDisplay(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * e);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);

  return <span className={`num ${className ?? ''}`} style={style}>{format(display)}</span>;
}