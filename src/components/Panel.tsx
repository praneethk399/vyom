import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
}

/** Beveled, clipped panel — hairline border via 1px outer layer, no soft shadows */
export function Panel({ title, right, children, className = '', bodyClassName = '', headerClassName = '' }: PanelProps) {
  return (
    <section className={`hud-panel flex min-h-0 flex-col ${className}`}>
      {title && (
        <header className={`bd-b flex shrink-0 items-center justify-between gap-2 px-3 py-1.5 ${headerClassName}`}>
          <span className="eyebrow glow-soft text-accent">{title}</span>
          {right && <div className="flex min-w-0 items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={`min-h-0 flex-1 px-3 py-2.5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}