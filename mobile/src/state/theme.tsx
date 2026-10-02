import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';

/** What the user chose: follow the device, or force light/dark. */
export type ThemePreference = 'system' | 'light' | 'dark';
/** The theme actually rendered — preference resolved against the device appearance. */
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'themePreference';
const CYCLE: ThemePreference[] = ['system', 'light', 'dark'];

interface ThemeState {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  /** System → Light → Dark → System, for the header toggle. */
  cyclePreference: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/**
 * Single source of truth for theming. The resolved theme drives the
 * GluestackUIProvider mode (which calls `Uniwind.setTheme`), the expo-router
 * ThemeProvider, and — via `useTheme()` — every inline token color, so
 * gluestack components, uniwind classNames and token colors never disagree.
 * The user's choice persists in AsyncStorage (key `themePreference`).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') setPreferenceState(stored);
      })
      .catch(() => undefined); // unreadable storage → keep the 'system' default
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const cyclePreference = useCallback(() => {
    setPreference(CYCLE[(CYCLE.indexOf(preference) + 1) % CYCLE.length]);
  }, [preference, setPreference]);

  const resolvedTheme: ResolvedTheme = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference, cyclePreference }),
    [preference, resolvedTheme, setPreference, cyclePreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePreference must be used inside ThemeProvider');
  return ctx;
}
