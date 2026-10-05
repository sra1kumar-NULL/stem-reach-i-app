import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * True when the user asked the OS / browser for reduced motion
 * (web `prefers-reduced-motion: reduce`, native `AccessibilityInfo.isReduceMotionEnabled`).
 * Live: follows changes while the app is open. Animated components should skip
 * movement (translate/scale/rotate/confetti) and use an instant change or a plain fade.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia(QUERY).matches;
    }
    return false;
  });

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
      const mql = window.matchMedia(QUERY);
      const onChange = () => setReduced(mql.matches);
      onChange();
      mql.addEventListener?.('change', onChange);
      return () => mql.removeEventListener?.('change', onChange);
    }
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
