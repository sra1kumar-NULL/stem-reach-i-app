import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { Heading } from '@/components/ui/heading';
import { Type } from '@/constants/theme';
import type { Href } from 'expo-router';

/**
 * Shared screen headers (UX#13) so every screen has the same rhythm.
 *
 * - `TabHeader`: top-level tab screens - 28 px Fredoka title, optional right action.
 * - `PushedHeader`: pushed/detail screens - 44 pt BackButton, 18 px title (centered
 *   between the back control and the action), optional right action.
 *
 * `right` should itself be a >= 44 pt target (e.g. `<Button size="icon">`).
 */
export const TAB_TITLE_SIZE = 28;
export const PUSHED_TITLE_SIZE = 18;

interface TabHeaderProps {
  title: string;
  right?: ReactNode;
}

export function TabHeader({ title, right }: TabHeaderProps) {
  return (
    <View style={styles.row}>
      <Heading accessibilityRole="header" numberOfLines={2} style={[Type.heading, styles.tabTitle]}>
        {title}
      </Heading>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

interface PushedHeaderProps {
  title: string;
  /** Where Back goes when there is no history (cold deep link / web refresh). */
  fallback: Href;
  /** Back label for screen readers, default "Back". */
  backLabel?: string;
  right?: ReactNode;
}

export function PushedHeader({ title, fallback, backLabel, right }: PushedHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.side}>
        <BackButton fallback={fallback} label={backLabel} iconOnly />
      </View>
      <Heading accessibilityRole="header" numberOfLines={1} style={[Type.heading, styles.pushedTitle]}>
        {title}
      </Heading>
      <View style={[styles.side, styles.sideEnd]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  tabTitle: { flex: 1, fontSize: TAB_TITLE_SIZE, lineHeight: 36 },
  right: { flexShrink: 0 },
  side: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  sideEnd: { alignItems: 'flex-end' },
  pushedTitle: { flex: 1, fontSize: PUSHED_TITLE_SIZE, lineHeight: 24, textAlign: 'center' },
});
