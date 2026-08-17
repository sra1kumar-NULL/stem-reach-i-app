/**
 * Nord theme (https://www.nordtheme.com) — the entire app uses this palette.
 * Dark mode: Polar Night backgrounds. Light mode: Snow Storm backgrounds.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Raw Nord palette (16 colors). */
export const Nord = {
  /** Polar Night — backgrounds */
  nord0: '#2E3440',
  nord1: '#3B4252',
  nord2: '#434C5E',
  nord3: '#4C566A',
  /** Snow Storm — text/foregrounds */
  nord4: '#D8DEE9',
  nord5: '#E5E9F0',
  nord6: '#ECEFF4',
  /** Frost — blues */
  nord7: '#8FBCBB',
  nord8: '#88C0D0',
  nord9: '#81A1C1',
  nord10: '#5E81AC',
  /** Aurora — accents */
  nord11: '#BF616A',
  nord12: '#D08770',
  nord13: '#EBCB8B',
  nord14: '#A3BE8C',
  nord15: '#B48EAD',
} as const;

export const Colors = {
  light: {
    text: Nord.nord0,
    background: Nord.nord6,
    backgroundElement: Nord.nord5,
    backgroundSelected: Nord.nord4,
    textSecondary: Nord.nord3,
  },
  dark: {
    text: Nord.nord6,
    background: Nord.nord0,
    backgroundElement: Nord.nord1,
    backgroundSelected: Nord.nord2,
    textSecondary: Nord.nord4,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Semantic accent palette (Nord-derived) shared across light & dark mode. */
export const Accents = {
  primary: Nord.nord10,
  primarySoft: 'rgba(94, 129, 172, 0.18)',
  success: Nord.nord14,
  successSoft: 'rgba(163, 190, 140, 0.18)',
  warn: Nord.nord13,
  warnSoft: 'rgba(235, 203, 139, 0.18)',
  danger: Nord.nord11,
  dangerSoft: 'rgba(191, 97, 106, 0.18)',
  purple: Nord.nord15,
  purpleSoft: 'rgba(180, 142, 173, 0.18)',
  pink: Nord.nord12,
  pinkSoft: 'rgba(208, 135, 112, 0.18)',
  teal: Nord.nord7,
  tealSoft: 'rgba(143, 188, 187, 0.18)',
  /** borders / tracks on dark surfaces */
  border: Nord.nord3,
  track: Nord.nord2,
} as const;

export const Fonts = Platform.select({
  ios: {
    /** Body font */
    sans: 'Nunito_400Regular',
    /** Headings — kid-friendly rounded font */
    rounded: 'Fredoka_600SemiBold',
    /** System fallbacks */
    serif: 'ui-serif',
    mono: 'ui-monospace',
  },
  android: {
    sans: 'Nunito_400Regular',
    rounded: 'Fredoka_600SemiBold',
    serif: 'serif',
    mono: 'monospace',
  },
  default: {
    sans: 'Nunito_400Regular',
    rounded: 'Fredoka_600SemiBold',
    serif: 'serif',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-sans)',
    rounded: 'var(--font-rounded)',
    serif: 'var(--font-serif)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
