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
    /* Accent-colored text on light surfaces — mirrors the `--*-text` light
       values in global.css (same Nord hue, lightness lowered for ≥4.5:1). */
    primaryText: '#446083',
    successText: '#526B3D',
    warnText: '#846017',
    dangerText: '#9C3F48',
    purpleText: '#7E5376',
  },
  dark: {
    text: Nord.nord6,
    background: Nord.nord0,
    backgroundElement: Nord.nord1,
    backgroundSelected: Nord.nord2,
    textSecondary: Nord.nord4,
    /* Accent-colored text on dark surfaces — mirrors the `--*-text` dark
       values in global.css (same Nord hue, lightness raised for ≥4.5:1). */
    primaryText: '#ABBDD3',
    successText: '#BACEA9',
    warnText: '#EBCB8B',
    dangerText: '#E8BBC0',
    purpleText: '#D2BBCD',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Readable label/icon color (nord0 or nord6) for a SOLID accent fill — avatar
 * chips, status pills, pastel buttons — where the fill does not follow the
 * theme. Picks whichever has the higher WCAG contrast against the fill.
 * For accent *text on theme surfaces*, use the `--*-text` tokens instead.
 */
export function onAccent(fill: string): string {
  const toRgb = (hex: string) => {
    const h = hex.replace('#', '');
    return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  };
  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrastWith = (fg: string) => {
    const [a, b] = [luminance(toRgb(fg)), luminance(toRgb(fill))].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  };
  return contrastWith(Nord.nord0) >= contrastWith(Nord.nord6) ? Nord.nord0 : Nord.nord6;
}

/** Semantic accent palette (Nord-derived) shared across light & dark mode. */
export const Accents = {
  /* Frost nord10 darkened (same hue) — mirrors the CSS `--primary`. nord6/white
     labels on it reach 4.82:1 / 5.56:1 (raw nord10 gave 3.50:1 / 4.03:1).
     This is a FILL colour: for primary-coloured text or icons on a theme
     surface use `Colors[scheme].primaryText` instead (2.25:1 on Polar Night). */
  primary: '#4C6A91',
  primarySoft: 'rgba(94, 129, 172, 0.18)',
  success: Nord.nord14,
  successSoft: 'rgba(163, 190, 140, 0.18)',
  warn: Nord.nord13,
  warnSoft: 'rgba(235, 203, 139, 0.18)',
  danger: Nord.nord11,
  /** Solid destructive FILL — white / nord6 labels reach 6.24:1 / 5.41:1
      (raw nord11 only gives 4.09:1). Mirrors the CSS `--destructive`. */
  destructive: '#A33F4A',
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

/** Typography pairs for use with the design-system components. */
export const Type = {
  body: { fontFamily: Fonts.sans, fontWeight: '400' } as const,
  bodySemi: { fontFamily: Fonts.sans, fontWeight: '600' } as const,
  bodyBold: { fontFamily: Fonts.sans, fontWeight: '700' } as const,
  heading: { fontFamily: Fonts.rounded, fontWeight: '600' } as const,
  headingBold: { fontFamily: Fonts.rounded, fontWeight: '700' } as const,
};

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;
