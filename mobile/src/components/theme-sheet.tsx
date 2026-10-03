/**
 * ThemeSheet — appearance picker (System / Light / Dark) in a bottom sheet.
 *
 * Same structure/a11y idiom as ConfirmSheet — React Native's `Modal` rather
 * than an absolutely-positioned overlay: a native modal window layers above
 * the header and tab bar, reports modal semantics to assistive tech, and
 * supplies the Android hardware-back contract (`onRequestClose`) plus
 * slide/fade animation natively — but none of its confirm semantics: a row
 * tap applies the preference immediately and closes, because there is nothing
 * to confirm.
 *
 * The choice flows through `setPreference` (the single source of truth in
 * state/theme.tsx), which persists to AsyncStorage and re-resolves the value
 * driving GluestackUIProvider mode → Uniwind.setTheme + the token colors, so
 * gluestack, uniwind classNames and inline tokens never disagree.
 */
import { Ionicons } from '@expo/vector-icons';
import { type JSX, useCallback } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box } from '@/components/ui/box';
import { Heading } from '@/components/ui/heading';
import { Text as UIText } from '@/components/ui/text';
import { Accents, Nord, onAccent, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference, type ThemePreference } from '@/state/theme';

/** Nord Polar Night scrim (nord0 @ 60%) — reads the same in light and dark. */
const SCRIM = `${Nord.nord0}99`;

export interface ThemeOption {
  value: ThemePreference;
  label: string;
  /** One short line under the label, also spoken with the option. */
  hint: string;
  /** Ionicons glyph — the same family the header toggle already uses. */
  icon: keyof typeof Ionicons.glyphMap;
}

/** The three choices, shared with ThemeToggle so the glyph can't drift. */
export const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: 'system', label: 'System', hint: 'Follows your phone', icon: 'contrast-outline' },
  { value: 'light', label: 'Light', hint: 'Always bright', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', hint: 'Always dark', icon: 'moon-outline' },
];

export interface ThemeSheetProps {
  /** Toggles the sheet. */
  visible: boolean;
  /** Backdrop tap and Android hardware back. */
  onClose: () => void;
}

export function ThemeSheet({ visible, onClose }: ThemeSheetProps): JSX.Element | null {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { preference, setPreference } = useThemePreference();
  const theme = useTheme();

  // Apply + close in one step — the new theme is already rendered by the time
  // the sheet finishes dismissing, so the user sees the result immediately.
  const choose = useCallback(
    (next: ThemePreference) => {
      setPreference(next);
      onClose();
    },
    [onClose, setPreference],
  );

  if (!visible) return null;

  const animationType = reducedMotion ? 'fade' : 'slide';

  return (
    <Modal visible={visible} transparent animationType={animationType} statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: SCRIM }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <Box className="rounded-t-3xl bg-card px-6 pt-3" style={{ paddingBottom: insets.bottom + 24 }}>
          <Box className="self-center bg-border" style={styles.grabber} />

          <Heading accessibilityRole="header" style={[Type.heading, styles.title]}>
            Appearance
          </Heading>
          <UIText className="text-sm text-muted-foreground" style={[Type.body, styles.message]}>
            Choose how the app looks. Your choice is saved on this device.
          </UIText>

          <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="Appearance options">
            {THEME_OPTIONS.map((option) => {
              const selected = preference === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => choose(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${option.label} appearance`}
                  accessibilityHint={option.hint}
                  className={`min-h-11 flex-row items-center gap-3 rounded-2xl border px-4 py-3 ${
                    selected ? 'border-primary bg-primary-soft' : 'border-border bg-background'
                  }`}
                  style={({ pressed }) => (pressed ? styles.rowPressed : null)}
                >
                  <Box
                    className={`h-9 w-9 items-center justify-center rounded-full ${
                      selected ? 'bg-primary' : 'bg-secondary'
                    }`}
                  >
                    <Ionicons
                      name={option.icon}
                      size={18}
                      color={selected ? onAccent(Accents.primary) : theme.textSecondary}
                    />
                  </Box>

                  <Box className="flex-1 gap-0.5">
                    <UIText
                      className={`text-base font-bold ${selected ? 'text-primary-text' : 'text-foreground'}`}
                      style={Type.bodyBold}
                    >
                      {option.label}
                    </UIText>
                    <UIText className="text-sm text-muted-foreground" style={Type.body}>
                      {option.hint}
                    </UIText>
                  </Box>

                  {/* Same size when hidden so all rows stay aligned. */}
                  <Ionicons name="checkmark-circle" size={22} color={theme.primaryText} style={{ opacity: selected ? 1 : 0 }} />
                </Pressable>
              );
            })}
          </View>
        </Box>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  grabber: { width: 40, height: 4, borderRadius: 2 },
  title: { marginTop: 12 },
  message: { marginTop: 6 },
  options: { marginTop: 16, gap: 10 },
  rowPressed: { opacity: 0.7 },
});
