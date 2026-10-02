/**
 * Token colors for the current theme (preference × device appearance).
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useThemePreference } from '@/state/theme';

export function useTheme() {
  const { resolvedTheme } = useThemePreference();

  return Colors[resolvedTheme];
}
