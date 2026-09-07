import { useUiStore } from '../state/uiStore';

export function ThemeSwitch() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-muted transition-colors hover:border-[var(--line-strong)] hover:text-accent"
      aria-label={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? '☀ LIGHT' : '☾ DARK'}
    </button>
  );
}