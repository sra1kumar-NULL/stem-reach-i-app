import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';

import { ThemeSheet, THEME_OPTIONS } from '@/components/theme-sheet';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/state/theme';

/**
 * Header icon button that OPENS the Appearance sheet (System / Light / Dark)
 * instead of blind-cycling the preference. The glyph shows the CURRENT mode —
 * the persisted preference is the single source of truth, so gluestack,
 * uniwind classNames, token colors and this icon all switch together.
 */
export function ThemeToggle({ size = 18 }: { size?: number }) {
  const { preference } = useThemePreference();
  const theme = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  const current = THEME_OPTIONS.find((option) => option.value === preference) ?? THEME_OPTIONS[0];

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="rounded-full h-11 w-11 p-0"
        onPress={() => setSheetOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Appearance: ${current.label}`}
        accessibilityHint="Opens the appearance picker"
        accessibilityState={{ expanded: sheetOpen }}
      >
        <Ionicons name={current.icon} size={size} color={theme.text} />
      </Button>
      <ThemeSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
