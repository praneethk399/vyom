/**
 * Web Vibration API — works on Android Chrome; iOS Safari and desktop
 * browsers do not fire it. Shake + vignette is the primary critical channel;
 * vibration is a bonus on supported devices, never the only signal.
 */
export function vibrate(pattern: number | number[]): boolean {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
      return true;
    }
  } catch {
    /* not supported */
  }
  return false;
}

export function vibrationSupported(): boolean {
  try {
    return typeof navigator !== 'undefined' && 'vibrate' in navigator;
  } catch {
    return false;
  }
}