import { useRef, type ReactNode } from 'react';

interface HorizontalSwiperProps {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}

/** CSS scroll-snap carousel — no dependency, keyboard/touch friendly */
export function HorizontalSwiper({ children, className = '', labelledBy }: HorizontalSwiperProps) {
  const ref = useRef<HTMLDivElement>(null);

  const scroll = (dir: number) => {
    ref.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });
  };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={ref}
        role="region"
        aria-label={labelledBy}
        className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
      >
        {children}
      </div>
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scroll(-1)}
        className="absolute -left-1 top-1/2 hidden -translate-y-1/2 border bg-[color:var(--panel)] px-1.5 py-1 text-accent hover:bg-accent-soft md:block"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scroll(1)}
        className="absolute -right-1 top-1/2 hidden -translate-y-1/2 border bg-[color:var(--panel)] px-1.5 py-1 text-accent hover:bg-accent-soft md:block"
      >
        ›
      </button>
    </div>
  );
}