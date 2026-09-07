/** Minimal classname joiner (shadcn-style `cn`), no deps. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}